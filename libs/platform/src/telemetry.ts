import { NodeSDK } from '@opentelemetry/sdk-node'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions'
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http'
import { GrpcInstrumentation } from '@opentelemetry/instrumentation-grpc'
import { AmqplibInstrumentation } from '@opentelemetry/instrumentation-amqplib'
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg'
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core'

/**
 * Starts OpenTelemetry tracing. Import this module before anything else in a service's entry point:
 * instrumentations patch `http`, `@grpc/grpc-js`, `amqplib` and `pg` when they are first required.
 *
 * Context propagation (W3C traceparent in HTTP headers, gRPC metadata and AMQP headers) always runs, so one
 * trace spans api -> RabbitMQ -> checker -> gRPC -> scraper. Spans are only exported when
 * OTEL_EXPORTER_OTLP_ENDPOINT is set (e.g. the Aspire dashboard in the `obs` compose profile).
 */
export function startTelemetry(serviceName: string): NodeSDK | undefined {
  if (process.env.OTEL_SDK_DISABLED === 'true') return undefined
  // The SDK reads OTEL_TRACES_EXPORTER; without an endpoint, keep propagating context but export nothing.
  const exporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? 'otlp' : 'none'
  process.env.OTEL_TRACES_EXPORTER ??= exporter
  process.env.OTEL_METRICS_EXPORTER ??= 'none'
  process.env.OTEL_LOGS_EXPORTER ??= 'none'
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: serviceName }),
    instrumentations: [
      new HttpInstrumentation(),
      new GrpcInstrumentation(),
      new AmqplibInstrumentation(),
      new PgInstrumentation(),
      new NestInstrumentation(),
    ],
  })
  sdk.start()
  const shutdown = (): void => {
    sdk.shutdown().catch(() => undefined)
  }
  process.once('SIGTERM', shutdown)
  return sdk
}
