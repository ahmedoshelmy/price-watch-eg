export interface ApiConfig {
  port: number
  databaseUrl: string
  rabbitUrl: string
  outboxPollMs: number
  demoData: boolean
}

export const API_CONFIG = Symbol('ApiConfig')

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

/** Validated once at start-up so a misconfigured container fails fast. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  return {
    port: int(env.PORT, 3000),
    databaseUrl: required(env, 'DATABASE_URL'),
    rabbitUrl: required(env, 'RABBITMQ_URL'),
    outboxPollMs: int(env.OUTBOX_POLL_MS, 500),
    demoData: env.DEMO_DATA === 'true',
  }
}
