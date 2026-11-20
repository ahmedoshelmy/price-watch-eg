import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { RoutingKey } from '@price-watch/contracts'
import { RabbitBus } from '@price-watch/platform'
import { DATA_SOURCE } from '../persistence/typeorm-unit-of-work'
import { API_CONFIG, type ApiConfig } from '../../../config'

interface PendingRow {
  id: string
  routing_key: RoutingKey
  payload: never
  trace_headers: Record<string, string>
}

/**
 * Publishes outbox rows to RabbitMQ. FOR UPDATE SKIP LOCKED lets several API replicas relay in parallel without
 * sending a row twice; a row is marked published only after the broker confirmed it (at-least-once delivery).
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name)
  private timer: NodeJS.Timeout | undefined
  private running = false

  constructor(
    @Inject(DATA_SOURCE) private readonly db: DataSource,
    private readonly bus: RabbitBus,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.tick(), this.config.outboxPollMs)
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer)
  }

  /** One relay pass; returns how many messages were published. */
  async tick(): Promise<number> {
    if (this.running) return 0
    this.running = true
    try {
      return await this.db.transaction(async (em) => {
        const rows: PendingRow[] = await em.query(
          `SELECT id, routing_key, payload, trace_headers FROM outbox
            WHERE published_at IS NULL ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED`,
        )
        const sent: string[] = []
        for (const row of rows) {
          try {
            await this.bus.publish(row.routing_key, row.payload, { messageId: row.id, traceHeaders: row.trace_headers })
            sent.push(row.id)
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            await em.query(`UPDATE outbox SET attempts = attempts + 1, last_error = $2 WHERE id = $1`, [row.id, message])
            this.logger.warn(`Outbox publish failed for ${row.id}: ${message}`)
            break
          }
        }
        if (sent.length) await em.query(`UPDATE outbox SET published_at = now() WHERE id = ANY($1)`, [sent])
        return sent.length
      })
    } catch (err) {
      this.logger.error(`Outbox relay pass failed: ${err instanceof Error ? err.message : String(err)}`)
      return 0
    } finally {
      this.running = false
    }
  }
}
