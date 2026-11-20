import type { EventMap, PriceObserved, RoutingKey } from '@price-watch/contracts'
import type { CheckerConfig } from '../config'
import type { EventPublisher, ScrapeResult, ScraperClient } from './ports'
import { RunCheck } from './run-check'

class FakeScraper implements ScraperClient {
  calls: Array<{ query: string; deadlineMs: number }> = []
  constructor(private readonly result: ScrapeResult) {}
  async search(query: string, deadlineMs: number): Promise<ScrapeResult> {
    this.calls.push({ query, deadlineMs })
    return this.result
  }
}

class RecordingPublisher implements EventPublisher {
  messages: Array<{ key: RoutingKey; payload: unknown }> = []
  async publish<K extends RoutingKey>(key: K, payload: EventMap[K]): Promise<void> {
    this.messages.push({ key, payload })
  }
}

const config = { searchDeadlineMs: 1234 } as CheckerConfig
const clock = { now: () => new Date('2026-03-01T10:00:00Z') }
const request = {
  checkId: 'c1',
  watchId: 'w1',
  query: 'kindle paperwhite',
  requestedAt: '2026-03-01T09:59:00Z',
}

describe('RunCheck (CheckRequested consumer)', () => {
  it('searches with the configured deadline and publishes what the shops returned', async () => {
    const scraper = new FakeScraper({
      offers: [
        { shop: 'noon', title: 'Kindle', pricePiastres: 870_000, url: 'https://example.com', inStock: true },
      ],
      shops: [
        { shop: 'noon', status: 'found' },
        { shop: 'jumia', status: 'failed', error: 'timed out' },
      ],
    })
    const publisher = new RecordingPublisher()
    await new RunCheck(scraper, publisher, clock, config).execute(request)

    expect(scraper.calls).toEqual([{ query: 'kindle paperwhite', deadlineMs: 1234 }])
    expect(publisher.messages).toHaveLength(1)
    expect(publisher.messages[0]?.key).toBe('price.observed')
    expect(publisher.messages[0]?.payload).toEqual<PriceObserved>({
      checkId: 'c1',
      watchId: 'w1',
      query: 'kindle paperwhite',
      observedAt: '2026-03-01T10:00:00.000Z',
      offers: [
        { shop: 'noon', title: 'Kindle', pricePiastres: 870_000, url: 'https://example.com', inStock: true },
      ],
      shops: [
        { shop: 'noon', status: 'found' },
        { shop: 'jumia', status: 'failed', error: 'timed out' },
      ],
    })
  })

  it('still publishes a check when the sidecar is unreachable, marked as failed', async () => {
    const publisher = new RecordingPublisher()
    const observed = await new RunCheck(
      new FakeScraper({ offers: [], shops: [], error: '14: UNAVAILABLE' }),
      publisher,
      clock,
      config,
    ).execute(request)
    expect(observed.offers).toEqual([])
    expect(observed.shops).toEqual([{ shop: 'scraper', status: 'failed', error: '14: UNAVAILABLE' }])
    expect(publisher.messages).toHaveLength(1)
  })
})
