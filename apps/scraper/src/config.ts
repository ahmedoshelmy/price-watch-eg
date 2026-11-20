export interface ScraperConfig {
  mode: 'fake' | 'live'
  grpcUrl: string
  httpPort: number
  shopTimeoutMs: number
  shopConcurrency: number
  maxConcurrentSearches: number
  cacheTtlMs: number
  fakeLatencyMs: number
}

function int(value: string | undefined, fallback: number): number {
  const n = value === undefined || value === '' ? fallback : Number(value)
  if (!Number.isInteger(n) || n < 0) throw new Error(`Expected a non-negative integer, got "${value}"`)
  return n
}

/** Reads and validates configuration once at start-up; a bad value stops the service instead of misbehaving later. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ScraperConfig {
  const mode = env.SCRAPER_MODE ?? 'fake'
  if (mode !== 'fake' && mode !== 'live') throw new Error(`SCRAPER_MODE must be fake or live, got "${mode}"`)
  return {
    mode,
    grpcUrl: `0.0.0.0:${int(env.GRPC_PORT, 50051)}`,
    httpPort: int(env.PORT, 3002),
    shopTimeoutMs: int(env.SCRAPER_SHOP_TIMEOUT_MS, 20_000),
    shopConcurrency: int(env.SCRAPER_SHOP_CONCURRENCY, 4),
    maxConcurrentSearches: int(env.SCRAPER_MAX_CONCURRENT_SEARCHES, 2),
    cacheTtlMs: int(env.SCRAPER_CACHE_TTL_MS, 10 * 60_000),
    fakeLatencyMs: int(env.SCRAPER_FAKE_LATENCY_MS, 40),
  }
}

export const SCRAPER_CONFIG = Symbol('ScraperConfig')
