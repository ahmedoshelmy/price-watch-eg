import { connect, type ChannelModel, type ConfirmChannel, type ConsumeMessage } from 'amqplib'
import { context, propagation, ROOT_CONTEXT } from '@opentelemetry/api'
import { EXCHANGE, type EventMap, type RoutingKey } from '@price-watch/contracts'

export type TraceHeaders = Record<string, string>

export interface PublishOptions {
  /** Stable id of the message (outbox row id); consumers use it for logs and dedupe. */
  messageId?: string
  /** W3C trace context captured when the message was created (see captureTraceHeaders). */
  traceHeaders?: TraceHeaders
}

export interface SubscribeOptions {
  /** Durable, shared queue: every instance of a service competes for its messages. */
  queue?: string
  /** Most unacknowledged messages one instance holds at once (competing-consumer back-pressure). */
  prefetch: number
}

export interface Logger {
  log(message: string): void
  error(message: string, trace?: string): void
}

const DEAD_LETTER_EXCHANGE = `${EXCHANGE}.dead-letter`
const DEAD_LETTER_QUEUE = `${EXCHANGE}.dead-letter`

/** The current trace context as headers, to store with a message that is published later (outbox). */
export function captureTraceHeaders(): TraceHeaders {
  const headers: TraceHeaders = {}
  propagation.inject(context.active(), headers)
  return headers
}

/**
 * Thin typed wrapper over one amqplib connection: a topic exchange of integration events, publisher confirms,
 * durable queues with a dead-letter queue for poison messages. On connection loss the process exits and the
 * orchestrator restarts it; messages are safe in durable queues and the outbox, so nothing is lost.
 */
export class RabbitBus {
  private constructor(
    private readonly connection: ChannelModel,
    private readonly channel: ConfirmChannel,
    private readonly logger: Logger,
  ) {}

  static async connect(url: string, logger: Logger, attempts = 30): Promise<RabbitBus> {
    for (let attempt = 1; ; attempt++) {
      try {
        const connection = await connect(url)
        const channel = await connection.createConfirmChannel()
        await channel.assertExchange(EXCHANGE, 'topic', { durable: true })
        await channel.assertExchange(DEAD_LETTER_EXCHANGE, 'fanout', { durable: true })
        await channel.assertQueue(DEAD_LETTER_QUEUE, { durable: true })
        await channel.bindQueue(DEAD_LETTER_QUEUE, DEAD_LETTER_EXCHANGE, '')
        const bus = new RabbitBus(connection, channel, logger)
        connection.on('close', (err?: Error) => bus.onClosed(err))
        return bus
      } catch (err) {
        if (attempt >= attempts) throw err
        logger.log(`RabbitMQ not reachable (attempt ${attempt}/${attempts}), retrying`)
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
  }

  private closing = false

  private onClosed(err?: Error): void {
    if (this.closing) return
    this.logger.error(`RabbitMQ connection closed${err ? `: ${err.message}` : ''}; exiting so the service restarts`)
    process.exit(1)
  }

  async publish<K extends RoutingKey>(key: K, payload: EventMap[K], options: PublishOptions = {}): Promise<void> {
    const body = Buffer.from(JSON.stringify(payload))
    const send = (): void => {
      this.channel.publish(EXCHANGE, key, body, {
        persistent: true,
        contentType: 'application/json',
        type: key,
        messageId: options.messageId,
        timestamp: Math.floor(Date.now() / 1000),
      })
    }
    // Publish inside the stored trace context so the consumer's span joins the original request's trace.
    if (options.traceHeaders) context.with(propagation.extract(ROOT_CONTEXT, options.traceHeaders), send)
    else send()
    await this.channel.waitForConfirms()
  }

  /**
   * Consumes events with the given routing keys. A handler that throws dead-letters the message (no hot retry
   * loop); handlers must be idempotent because RabbitMQ delivers at least once.
   * Without `queue`, an exclusive auto-deleted queue is used: every instance receives every message (fan-out).
   */
  async subscribe<K extends RoutingKey>(
    keys: K[],
    handler: (event: EventMap[K], key: K) => Promise<void>,
    options: SubscribeOptions,
  ): Promise<string> {
    const channel = await this.connection.createChannel()
    await channel.prefetch(options.prefetch)
    const { queue } = options.queue
      ? await channel.assertQueue(options.queue, {
          durable: true,
          arguments: { 'x-dead-letter-exchange': DEAD_LETTER_EXCHANGE },
        })
      : await channel.assertQueue('', { exclusive: true, autoDelete: true })
    for (const key of keys) await channel.bindQueue(queue, EXCHANGE, key)
    await channel.consume(queue, (msg: ConsumeMessage | null) => {
      if (!msg) return
      const key = msg.fields.routingKey as K
      let event: EventMap[K]
      try {
        event = JSON.parse(msg.content.toString('utf8')) as EventMap[K]
      } catch {
        this.logger.error(`Dropping unreadable ${key} message ${msg.properties.messageId ?? ''}`)
        channel.nack(msg, false, false)
        return
      }
      handler(event, key).then(
        () => channel.ack(msg),
        (err: unknown) => {
          const e = err instanceof Error ? err : new Error(String(err))
          this.logger.error(`Handler for ${key} failed, dead-lettering: ${e.message}`, e.stack)
          channel.nack(msg, false, false)
        },
      )
    })
    return queue
  }

  async close(): Promise<void> {
    this.closing = true
    await this.connection.close().catch(() => undefined)
  }
}
