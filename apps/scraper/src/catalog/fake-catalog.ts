import type { ShopResultMessage } from '@price-watch/contracts'
import { toPiastres, type ShopCatalog } from './shop-catalog'

/** Invented demo products with an invented base price in EGP. Not real offers. */
export const DEMO_PRODUCTS: ReadonlyArray<{ query: string; title: string; baseEgp: number }> = [
  { query: 'logitech g102', title: 'Logitech G102 Lightsync Gaming Mouse', baseEgp: 950 },
  { query: 'airpods pro 2', title: 'Apple AirPods Pro (2nd generation)', baseEgp: 11500 },
  { query: 'galaxy a55', title: 'Samsung Galaxy A55 5G 8/256GB', baseEgp: 18900 },
  { query: 'redmi note 13', title: 'Xiaomi Redmi Note 13 8/256GB', baseEgp: 10400 },
  { query: 'kindle paperwhite', title: 'Kindle Paperwhite 16GB', baseEgp: 8700 },
]

export const DEMO_SHOPS: ReadonlyArray<{ id: string; domain: string; markup: number }> = [
  { id: 'amazon', domain: 'amazon.eg', markup: 0.0 },
  { id: 'noon', domain: 'noon.com', markup: 0.02 },
  { id: 'jumia', domain: 'jumia.com.eg', markup: 0.04 },
  { id: 'btech', domain: 'btech.com', markup: 0.05 },
  { id: '2b', domain: '2b.com.eg', markup: 0.03 },
  { id: 'raya', domain: 'rayashop.com', markup: 0.06 },
]

/** FNV-1a: a tiny stable hash so fake prices are deterministic per (query, shop, day). */
export function stableHash(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function normaliseQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ')
}

export interface FakeCatalogOptions {
  now?: () => Date
  /** Delay before each shop "answers", to show streaming; 0 in tests. */
  latencyMs?: number
}

/**
 * Deterministic stand-in for the real scraper (CI, tests, demos). Prices move by a few percent per day,
 * out-of-stock and failing shops are simulated, and unknown queries get a price derived from their hash.
 */
export class FakeCatalog implements ShopCatalog {
  readonly mode = 'fake' as const
  private readonly now: () => Date
  private readonly latencyMs: number

  constructor(options: FakeCatalogOptions = {}) {
    this.now = options.now ?? (() => new Date())
    this.latencyMs = options.latencyMs ?? 0
  }

  async *search(query: string, shops: string[]): AsyncIterable<ShopResultMessage> {
    const q = normaliseQuery(query)
    const product = DEMO_PRODUCTS.find((p) => q.includes(p.query) || p.query.includes(q))
    const title = product?.title ?? titleCase(q)
    const baseEgp = product?.baseEgp ?? 500 + (stableHash(q) % 19500)
    const day = this.now().toISOString().slice(0, 10)
    const selected = DEMO_SHOPS.filter((s) => shops.length === 0 || shops.includes(s.id))

    for (const shop of selected) {
      if (this.latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, this.latencyMs))
      yield this.shopResult(q, title, baseEgp, day, shop)
    }
  }

  private shopResult(
    q: string,
    title: string,
    baseEgp: number,
    day: string,
    shop: (typeof DEMO_SHOPS)[number],
  ): ShopResultMessage {
    const h = stableHash(`${q}|${shop.id}|${day}`)
    // About one shop-day in twelve fails, like a real shop timing out.
    if (h % 12 === 0)
      return { shop: shop.id, status: 'SHOP_STATUS_FAILED', offers: [], error: 'timed out (simulated)' }
    const swing = ((h % 13) - 6) / 100
    const price = Math.round(baseEgp * (1 + shop.markup + swing))
    const slug = q.replace(/[^a-z0-9]+/g, '-')
    return {
      shop: shop.id,
      status: 'SHOP_STATUS_FOUND',
      error: '',
      offers: [
        {
          shop: shop.id,
          title,
          pricePiastres: toPiastres(price),
          url: `https://www.${shop.domain}/search?q=${encodeURIComponent(q)}#demo-${slug}`,
          inStock: (h >> 4) % 9 !== 0,
        },
      ],
    }
  }
}

function titleCase(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase())
}
