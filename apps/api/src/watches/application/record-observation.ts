import { Inject, Injectable, Logger } from '@nestjs/common'
import type { PriceObserved } from '@price-watch/contracts'
import { evaluateDrop, LOOKBACK_DAYS } from '../domain/drop-rule'
import { Observation } from '../domain/observation'
import { ID_GENERATOR, UNIT_OF_WORK, type IdGenerator, type UnitOfWork } from './ports'

const DAY_MS = 86_400_000

export type RecordOutcome = 'recorded' | 'dropped' | 'duplicate' | 'unknown-watch'

/**
 * Handles PriceObserved: stores the check as history and, when the drop rule fires, stores the alert and
 * emits PriceDropped, all in one transaction. Idempotent twice over: a redelivered check is skipped by its
 * checkId, and an alert is stored at most once per key (watch, Cairo day, price).
 */
@Injectable()
export class RecordObservation {
  private readonly logger = new Logger(RecordObservation.name)

  constructor(
    @Inject(UNIT_OF_WORK) private readonly uow: UnitOfWork,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  execute(event: PriceObserved): Promise<RecordOutcome> {
    return this.uow.run(async (tx) => {
      if (await tx.observations.existsForCheck(event.checkId)) return 'duplicate'
      const watch = await tx.watches.get(event.watchId)
      if (!watch) return 'unknown-watch'

      const observedAt = new Date(event.observedAt)
      const observation = Observation.fromCheck({
        id: this.ids.next(),
        watchId: watch.id,
        checkId: event.checkId,
        observedAt,
        offers: event.offers,
        shops: event.shops,
      })
      const history = await tx.observations.healthyLowsSince(
        watch.id,
        new Date(observedAt.getTime() - LOOKBACK_DAYS * DAY_MS),
      )
      const decision = evaluateDrop({ watch, observation, history })
      let outcome: RecordOutcome = 'recorded'
      if (decision) {
        const stored = await tx.alerts.tryAdd({
          id: this.ids.next(),
          key: decision.alertKey,
          watchId: watch.id,
          pricePiastres: decision.offer.pricePiastres,
          reasons: decision.reasons,
          createdAt: observedAt,
        })
        observation.flagDrop(decision.reasons)
        if (stored) {
          outcome = 'dropped'
          await tx.outbox.add('price.dropped', {
            alertKey: decision.alertKey,
            watchId: watch.id,
            query: watch.query,
            pricePiastres: decision.offer.pricePiastres,
            targetPiastres: watch.targetPiastres,
            shop: decision.offer.shop,
            url: decision.offer.url,
            reasons: decision.reasons,
            observedAt: event.observedAt,
          })
          this.logger.log(`Price drop for watch ${watch.id}: ${decision.reasons.join(', ')}`)
        }
      }
      await tx.observations.add(observation)
      watch.markChecked(observedAt)
      await tx.watches.save(watch)
      return outcome
    })
  }
}
