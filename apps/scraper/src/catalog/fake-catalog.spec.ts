import type { ShopResultMessage } from '@price-watch/contracts'
import { DEMO_SHOPS, FakeCatalog } from './fake-catalog'

async function collect(results: AsyncIterable<ShopResultMessage>): Promise<ShopResultMessage[]> {
  const out: ShopResultMessage[] = []
  for await (const r of results) out.push(r)
  return out
}

const day = (iso: string) => () => new Date(iso)

describe('FakeCatalog', () => {
  it('answers once per demo shop with prices near the product base price', async () => {
    const results = await collect(new FakeCatalog({ now: day('2026-03-01T10:00:00Z') }).search('Logitech G102', []))
    expect(results.map((r) => r.shop)).toEqual(DEMO_SHOPS.map((s) => s.id))
    for (const offer of results.flatMap((r) => r.offers)) {
      expect(offer.pricePiastres).toBeGreaterThan(80_000)
      expect(offer.pricePiastres).toBeLessThan(115_000)
      expect(offer.url).toMatch(/^https:\/\//)
    }
  })

  it('is deterministic for the same query and day', async () => {
    const catalog = new FakeCatalog({ now: day('2026-03-01T10:00:00Z') })
    expect(await collect(catalog.search('galaxy a55', []))).toEqual(await collect(catalog.search('  Galaxy   A55 ', [])))
  })

  it('moves prices from one day to the next', async () => {
    const monday = await collect(new FakeCatalog({ now: day('2026-03-02T10:00:00Z') }).search('airpods pro 2', []))
    const tuesday = await collect(new FakeCatalog({ now: day('2026-03-03T10:00:00Z') }).search('airpods pro 2', []))
    expect(monday).not.toEqual(tuesday)
  })

  it('only searches the requested shops', async () => {
    const results = await collect(new FakeCatalog().search('kindle paperwhite', ['noon', 'btech']))
    expect(results.map((r) => r.shop)).toEqual(['noon', 'btech'])
  })

  it('simulates failing shops on some days, with no offers and an error', async () => {
    const catalog = (d: number) => new FakeCatalog({ now: day(`2026-01-${String(d).padStart(2, '0')}T08:00:00Z`) })
    const all = (await Promise.all(Array.from({ length: 28 }, (_, i) => collect(catalog(i + 1).search('redmi note 13', []))))).flat()
    const failed = all.filter((r) => r.status === 'SHOP_STATUS_FAILED')
    expect(failed.length).toBeGreaterThan(0)
    expect(failed.every((r) => r.offers.length === 0 && r.error !== '')).toBe(true)
  })

  it('prices unknown products from the query hash', async () => {
    const results = await collect(new FakeCatalog().search('some unknown blender', []))
    expect(results.some((r) => r.offers.length > 0)).toBe(true)
  })
})
