import type { ShopResultMessage, ShopStatusMessage } from '@price-watch/contracts'
import { toPiastres, type ShopCatalog } from './shop-catalog'

/**
 * The subset of the `egypt-price-scraper` library (github.com/ahmedoshelmy/egypt-price-scraper) this sidecar uses.
 * Declared here instead of imported so the monorepo builds without the library; the Docker image installs it.
 */
interface ScraperListing {
  source: string
  title: string
  url: string
  price: number | null
  sold: string | null
}

interface ScraperSourceOutcome {
  source: string
  status: 'found' | 'none' | 'failed' | 'blocked'
  error?: string
}

export interface ScraperLibrary {
  searchAll(
    query: string,
    options: { shops?: string[]; timeoutMs?: number; concurrency?: number },
  ): Promise<{ listings: ScraperListing[]; sources: ScraperSourceOutcome[] }>
}

const STATUS: Record<ScraperSourceOutcome['status'], ShopStatusMessage> = {
  found: 'SHOP_STATUS_FOUND',
  none: 'SHOP_STATUS_NONE',
  failed: 'SHOP_STATUS_FAILED',
  blocked: 'SHOP_STATUS_BLOCKED',
}

/** Loads the ESM-only library from CommonJS (TypeScript keeps this a real dynamic import under node16). */
export async function loadScraperLibrary(specifier = 'egypt-price-scraper'): Promise<ScraperLibrary> {
  const mod = (await import(specifier)) as ScraperLibrary
  if (typeof mod.searchAll !== 'function') throw new Error(`${specifier} does not export searchAll`)
  return mod
}

export interface LiveCatalogOptions {
  /** Time box per shop in ms. */
  shopTimeoutMs: number
  /** Shops read at once within one search. */
  shopConcurrency: number
}

/** Real searches through egypt-price-scraper. Reports every searched shop, including failures. */
export class LiveCatalog implements ShopCatalog {
  readonly mode = 'live' as const

  constructor(
    private readonly library: ScraperLibrary,
    private readonly options: LiveCatalogOptions,
  ) {}

  async *search(query: string, shops: string[]): AsyncIterable<ShopResultMessage> {
    const result = await this.library.searchAll(query, {
      shops: shops.length ? shops : undefined,
      timeoutMs: this.options.shopTimeoutMs,
      concurrency: this.options.shopConcurrency,
    })
    for (const outcome of result.sources) {
      const offers = result.listings
        .filter((l) => l.source === outcome.source && l.price !== null && l.price > 0)
        .map((l) => ({
          shop: l.source,
          title: l.title,
          pricePiastres: toPiastres(l.price ?? 0),
          url: l.url,
          inStock: l.sold !== 'Out of stock',
        }))
      yield { shop: outcome.source, status: STATUS[outcome.status], offers, error: outcome.error ?? '' }
    }
  }
}
