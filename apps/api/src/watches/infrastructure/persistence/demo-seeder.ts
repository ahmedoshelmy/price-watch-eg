import { randomUUID } from 'node:crypto'
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { API_CONFIG, type ApiConfig } from '../../../config'
import { Observation, type Offer } from '../../domain/observation'
import { Watch } from '../../domain/watch'
import { ObservationEntity, WatchEntity } from './schema'
import { DATA_SOURCE } from './typeorm-unit-of-work'

/** Invented demo watches; prices are made up and only shaped like real ones. */
const DEMO = [
  { query: 'Logitech G102', targetEgp: 850, baseEgp: 960 },
  { query: 'Kindle Paperwhite', targetEgp: 7900, baseEgp: 8800 },
  { query: 'Redmi Note 13', targetEgp: 9500, baseEgp: 10_500 },
]
const SHOPS = ['amazon', 'noon', 'jumia', 'btech', '2b', 'raya']
const DAY_MS = 86_400_000

/** Dev/demo only (DEMO_DATA=true): seeds three watches with 30 days of synthetic daily history into an empty DB. */
@Injectable()
export class DemoSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(DemoSeeder.name)

  constructor(
    @Inject(DATA_SOURCE) private readonly db: DataSource,
    @Inject(API_CONFIG) private readonly config: ApiConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.demoData || (await this.db.getRepository(WatchEntity).count()) > 0) return
    const now = Date.now()
    await this.db.transaction(async (em) => {
      for (const [i, demo] of DEMO.entries()) {
        const watch = Watch.create({
          id: randomUUID(),
          query: demo.query,
          targetPiastres: demo.targetEgp * 100,
          now: new Date(now - 31 * DAY_MS),
        })
        for (let day = 30; day >= 1; day--) {
          const observedAt = new Date(now - day * DAY_MS)
          const offers: Offer[] = SHOPS.map((shop, s) => ({
            shop,
            title: demo.query,
            // A gentle wave per shop: deterministic, no randomness, so screenshots are stable.
            pricePiastres:
              Math.round(demo.baseEgp * (1 + 0.04 * Math.sin((day + s * 2 + i) / 3) + s * 0.01)) * 100,
            url: `https://example.com/${shop}/${encodeURIComponent(demo.query)}`,
            inStock: true,
          }))
          const observation = Observation.fromCheck({
            id: randomUUID(),
            watchId: watch.id,
            checkId: randomUUID(),
            observedAt,
            offers,
            shops: SHOPS.map((shop) => ({ shop, status: 'found' as const })),
          })
          const s = observation.snapshot()
          watch.markChecked(observedAt)
          if (day === 30) await em.getRepository(WatchEntity).insert(watch.snapshot())
          await em.getRepository(ObservationEntity).insert({
            id: s.id,
            watchId: s.watchId,
            checkId: s.checkId,
            observedAt: s.observedAt,
            lowestPiastres: s.lowest?.pricePiastres ?? null,
            lowestOffer: s.lowest,
            healthy: s.healthy,
            dropReasons: [],
            offers: s.offers,
            shops: s.shops,
          })
        }
        await em
          .getRepository(WatchEntity)
          .update({ id: watch.id }, { lastCheckedAt: watch.snapshot().lastCheckedAt })
      }
    })
    this.logger.log(`Seeded ${DEMO.length} demo watches with 30 days of history`)
  }
}
