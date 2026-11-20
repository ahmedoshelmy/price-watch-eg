import type { ShopResultMessage } from '@price-watch/contracts'
import { PoliteCatalog } from './polite-catalog'
import type { ShopCatalog } from './shop-catalog'

const found: ShopResultMessage = { shop: 'noon', status: 'SHOP_STATUS_FOUND', offers: [], error: '' }
const failed: ShopResultMessage = {
  shop: 'jumia',
  status: 'SHOP_STATUS_FAILED',
  offers: [],
  error: 'timed out',
}

class CountingCatalog implements ShopCatalog {
  readonly mode = 'fake' as const
  calls = 0
  inFlight = 0
  maxInFlight = 0
  constructor(private readonly results: ShopResultMessage[]) {}
  async *search(): AsyncIterable<ShopResultMessage> {
    this.calls++
    this.inFlight++
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight)
    await new Promise((resolve) => setTimeout(resolve, 5))
    yield* this.results
    this.inFlight--
  }
}

async function drain(results: AsyncIterable<ShopResultMessage>): Promise<ShopResultMessage[]> {
  const out: ShopResultMessage[] = []
  for await (const r of results) out.push(r)
  return out
}

describe('PoliteCatalog', () => {
  it('reuses a healthy result for the same query within the TTL', async () => {
    let now = 0
    const inner = new CountingCatalog([found])
    const polite = new PoliteCatalog(inner, { maxConcurrentSearches: 2, cacheTtlMs: 1000, now: () => now })
    await drain(polite.search('AirPods Pro 2', []))
    await drain(polite.search('airpods  pro 2', []))
    expect(inner.calls).toBe(1)
    now = 1001
    await drain(polite.search('airpods pro 2', []))
    expect(inner.calls).toBe(2)
  })

  it('never caches a result with a failed shop, so the next check retries it', async () => {
    const inner = new CountingCatalog([found, failed])
    const polite = new PoliteCatalog(inner, { maxConcurrentSearches: 2, cacheTtlMs: 60_000 })
    await drain(polite.search('kindle', []))
    await drain(polite.search('kindle', []))
    expect(inner.calls).toBe(2)
  })

  it('caps how many searches run at once', async () => {
    const inner = new CountingCatalog([found])
    const polite = new PoliteCatalog(inner, { maxConcurrentSearches: 2, cacheTtlMs: 0 })
    await Promise.all(['a1', 'b2', 'c3', 'd4', 'e5'].map((q) => drain(polite.search(q, []))))
    expect(inner.calls).toBe(5)
    expect(inner.maxInFlight).toBe(2)
  })
})
