import type { ShopResultMessage } from '@price-watch/contracts'
import { normaliseQuery } from './fake-catalog'
import type { ShopCatalog } from './shop-catalog'

export interface PoliteCatalogOptions {
  /** Searches running at once across all callers (each search already fans out to many shops). */
  maxConcurrentSearches: number
  /** How long a finished search is reused for the same query and shops, so many watches never hammer shops. */
  cacheTtlMs: number
  now?: () => number
}

/**
 * Scraping etiquette as a decorator: a global concurrency cap and a short result cache in front of any catalog.
 * Failed shops are not cached, so the next caller retries them.
 */
export class PoliteCatalog implements ShopCatalog {
  private running = 0
  private readonly waiting: Array<() => void> = []
  private readonly cache = new Map<string, { at: number; results: ShopResultMessage[] }>()
  private readonly now: () => number

  constructor(
    private readonly inner: ShopCatalog,
    private readonly options: PoliteCatalogOptions,
  ) {
    this.now = options.now ?? Date.now
  }

  get mode(): 'fake' | 'live' {
    return this.inner.mode
  }

  async *search(query: string, shops: string[]): AsyncIterable<ShopResultMessage> {
    const key = `${normaliseQuery(query)}|${[...shops].sort().join(',')}`
    const hit = this.cache.get(key)
    if (hit && this.now() - hit.at < this.options.cacheTtlMs) {
      yield* hit.results
      return
    }
    await this.acquire()
    const results: ShopResultMessage[] = []
    try {
      for await (const result of this.inner.search(query, shops)) {
        results.push(result)
        yield result
      }
    } finally {
      this.release()
    }
    const healthy = results.filter((r) => r.status === 'SHOP_STATUS_FOUND' || r.status === 'SHOP_STATUS_NONE')
    if (healthy.length === results.length) this.cache.set(key, { at: this.now(), results })
  }

  private acquire(): Promise<void> {
    if (this.running < this.options.maxConcurrentSearches) {
      this.running++
      return Promise.resolve()
    }
    return new Promise((resolve) => this.waiting.push(resolve))
  }

  private release(): void {
    const next = this.waiting.shift()
    if (next) next()
    else this.running--
  }
}
