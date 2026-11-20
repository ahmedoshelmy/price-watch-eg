import type { PriceObserved } from '@price-watch/contracts'
import { Watch } from '../domain/watch'
import { InMemoryStore, sequentialIds } from './in-memory.spec-util'
import { RecordObservation } from './record-observation'

const WATCH_ID = 'watch-1'

function observed(checkId: string, observedAt: string, prices: number[], failedShops = 0): PriceObserved {
  const shops = ['noon', 'jumia', 'btech', '2b']
  return {
    checkId,
    watchId: WATCH_ID,
    query: 'demo mouse',
    observedAt,
    offers: prices.map((p, i) => ({
      shop: shops[i] ?? 'amazon',
      title: 'Demo mouse',
      pricePiastres: p,
      url: 'https://example.com',
      inStock: true,
    })),
    shops: shops.map((shop, i) => ({
      shop,
      status: i < failedShops ? ('failed' as const) : ('found' as const),
    })),
  }
}

describe('RecordObservation', () => {
  let store: InMemoryStore
  let useCase: RecordObservation

  beforeEach(() => {
    store = new InMemoryStore()
    const watch = Watch.create({
      id: WATCH_ID,
      query: 'demo mouse',
      targetPiastres: 100_000,
      now: new Date('2026-03-01T00:00:00Z'),
    })
    store.watches.set(WATCH_ID, watch.snapshot())
    useCase = new RecordObservation(store, sequentialIds())
  })

  it('stores the check, flags the drop and emits PriceDropped when the price is under target', async () => {
    expect(await useCase.execute(observed('c1', '2026-03-02T10:00:00Z', [95_000, 97_000]))).toBe('dropped')
    expect(store.observations[0]?.dropReasons).toEqual(['below-target'])
    expect(store.published('price.dropped')).toEqual([
      expect.objectContaining({
        watchId: WATCH_ID,
        pricePiastres: 95_000,
        shop: 'noon',
        reasons: ['below-target'],
      }),
    ])
    expect(store.watches.get(WATCH_ID)?.lastCheckedAt).toEqual(new Date('2026-03-02T10:00:00Z'))
  })

  it('skips a redelivered check by its id', async () => {
    await useCase.execute(observed('c1', '2026-03-02T10:00:00Z', [95_000]))
    expect(await useCase.execute(observed('c1', '2026-03-02T10:00:00Z', [95_000]))).toBe('duplicate')
    expect(store.observations).toHaveLength(1)
    expect(store.published('price.dropped')).toHaveLength(1)
  })

  it('emits one alert per watch, day and price even when two different checks see the same drop', async () => {
    await useCase.execute(observed('c1', '2026-03-02T10:00:00Z', [120_000, 125_000]))
    store.observations = [] // forget history so the second check also qualifies as a "first" drop
    await useCase.execute(observed('c2', '2026-03-03T09:00:00Z', [95_000]))
    store.observations = []
    expect(await useCase.execute(observed('c3', '2026-03-03T11:00:00Z', [95_000]))).toBe('recorded')
    expect(store.published('price.dropped')).toHaveLength(1)
  })

  it('records a mostly-failed check as unhealthy history without alerting', async () => {
    expect(await useCase.execute(observed('c1', '2026-03-02T10:00:00Z', [10_000], 3))).toBe('recorded')
    expect(store.observations[0]?.healthy).toBe(false)
    expect(store.published('price.dropped')).toHaveLength(0)
  })

  it('ignores checks for a deleted watch', async () => {
    store.watches.clear()
    expect(await useCase.execute(observed('c1', '2026-03-02T10:00:00Z', [95_000]))).toBe('unknown-watch')
    expect(store.observations).toHaveLength(0)
  })
})
