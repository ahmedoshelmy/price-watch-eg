export interface CheckerConfig {
  port: number
  apiUrl: string
  rabbitUrl: string
  scraperUrl: string
  /** A watch is due when its last check is older than this. */
  checkIntervalSeconds: number
  /** How often the scheduler looks for due watches. */
  scheduleEveryMs: number
  /** Checks one checker instance runs at once (RabbitMQ prefetch). */
  concurrency: number
  /** gRPC deadline for one search across all shops. */
  searchDeadlineMs: number
}

export const CHECKER_CONFIG = Symbol('CheckerConfig')

function int(value: string | undefined, fallback: number): number {
  const n = value === undefined || value === '' ? fallback : Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Expected a positive integer, got "${value}"`)
  return n
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CheckerConfig {
  return {
    port: int(env.PORT, 3001),
    apiUrl: required(env, 'API_URL').replace(/\/$/, ''),
    rabbitUrl: required(env, 'RABBITMQ_URL'),
    scraperUrl: required(env, 'SCRAPER_GRPC_URL'),
    checkIntervalSeconds: int(env.CHECK_INTERVAL_SECONDS, 6 * 3600),
    scheduleEveryMs: int(env.SCHEDULE_EVERY_MS, 60_000),
    concurrency: int(env.CHECKER_CONCURRENCY, 4),
    searchDeadlineMs: int(env.SEARCH_DEADLINE_MS, 45_000),
  }
}
