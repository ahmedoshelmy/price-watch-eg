import { Inject, Injectable, Logger } from '@nestjs/common'
import type { CheckRequested, PriceObserved } from '@price-watch/contracts'
import { CHECKER_CONFIG, type CheckerConfig } from '../config'
import { CLOCK, EVENT_PUBLISHER, SCRAPER_CLIENT, type Clock, type EventPublisher, type ScraperClient } from './ports'

/**
 * Handles one CheckRequested: searches the shops through the sidecar and publishes what it saw as PriceObserved.
 * A failed or timed-out search is still published (with failed shops), so history shows the gap and the API's
 * drop rule, not the checker, decides that an unreliable check must not alert.
 */
@Injectable()
export class RunCheck {
  private readonly logger = new Logger(RunCheck.name)

  constructor(
    @Inject(SCRAPER_CLIENT) private readonly scraper: ScraperClient,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(CHECKER_CONFIG) private readonly config: CheckerConfig,
  ) {}

  async execute(request: CheckRequested): Promise<PriceObserved> {
    const result = await this.scraper.search(request.query, this.config.searchDeadlineMs)
    const shops =
      result.shops.length > 0 ? result.shops : [{ shop: 'scraper', status: 'failed' as const, error: result.error ?? 'no shops answered' }]
    if (result.error) this.logger.warn(`Search for "${request.query}" incomplete: ${result.error}`)
    const observed: PriceObserved = {
      checkId: request.checkId,
      watchId: request.watchId,
      query: request.query,
      observedAt: this.clock.now().toISOString(),
      offers: result.offers,
      shops,
    }
    await this.publisher.publish('price.observed', observed)
    return observed
  }
}
