import { randomUUID } from 'node:crypto'
import { Inject, Injectable } from '@nestjs/common'
import { DataSource, MoreThanOrEqual, type EntityManager } from 'typeorm'
import { captureTraceHeaders } from '@price-watch/platform'
import type { EventMap, RoutingKey } from '@price-watch/contracts'
import type {
  AlertRepository,
  ObservationRepository,
  Outbox,
  Transaction,
  UnitOfWork,
  WatchRepository,
} from '../../application/ports'
import type { PastLow } from '../../domain/drop-rule'
import type { Observation } from '../../domain/observation'
import { Watch } from '../../domain/watch'
import { AlertEntity, ObservationEntity, OutboxEntity, WatchEntity, type WatchRow } from './schema'

export const DATA_SOURCE = Symbol('DataSource')

class TypeOrmWatchRepository implements WatchRepository {
  constructor(private readonly em: EntityManager) {}

  async get(id: string): Promise<Watch | null> {
    // Row lock: concurrent observations of one watch serialise instead of racing on lastCheckedAt.
    const row = await this.em.getRepository(WatchEntity).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } })
    return row ? Watch.restore(row) : null
  }

  async add(watch: Watch): Promise<void> {
    await this.em.getRepository(WatchEntity).insert(watch.snapshot())
  }

  async save(watch: Watch): Promise<void> {
    const { id, ...rest }: WatchRow = watch.snapshot()
    await this.em.getRepository(WatchEntity).update({ id }, rest)
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.em.getRepository(WatchEntity).delete({ id })
    return (result.affected ?? 0) > 0
  }
}

class TypeOrmObservationRepository implements ObservationRepository {
  constructor(private readonly em: EntityManager) {}

  async existsForCheck(checkId: string): Promise<boolean> {
    return this.em.getRepository(ObservationEntity).exists({ where: { checkId } })
  }

  async healthyLowsSince(watchId: string, since: Date): Promise<PastLow[]> {
    const rows = await this.em.getRepository(ObservationEntity).find({
      select: { observedAt: true, lowestPiastres: true },
      where: { watchId, healthy: true, observedAt: MoreThanOrEqual(since) },
      order: { observedAt: 'ASC' },
    })
    return rows.flatMap((r) => (r.lowestPiastres === null ? [] : [{ observedAt: r.observedAt, lowestPiastres: r.lowestPiastres }]))
  }

  async add(observation: Observation): Promise<void> {
    const s = observation.snapshot()
    await this.em.getRepository(ObservationEntity).insert({
      id: s.id,
      watchId: s.watchId,
      checkId: s.checkId,
      observedAt: s.observedAt,
      lowestPiastres: s.lowest?.pricePiastres ?? null,
      lowestOffer: s.lowest,
      healthy: s.healthy,
      dropReasons: s.dropReasons,
      offers: s.offers,
      shops: s.shops,
    })
  }
}

class TypeOrmAlertRepository implements AlertRepository {
  constructor(private readonly em: EntityManager) {}

  async tryAdd(alert: Parameters<AlertRepository['tryAdd']>[0]): Promise<boolean> {
    const result = await this.em
      .createQueryBuilder()
      .insert()
      .into(AlertEntity)
      .values({ id: alert.id, alertKey: alert.key, watchId: alert.watchId, pricePiastres: alert.pricePiastres, reasons: alert.reasons, createdAt: alert.createdAt })
      .orIgnore()
      .returning('id')
      .execute()
    return result.raw.length > 0
  }
}

class TypeOrmOutbox implements Outbox {
  constructor(private readonly em: EntityManager) {}

  async add<K extends RoutingKey>(key: K, payload: EventMap[K]): Promise<void> {
    await this.em.getRepository(OutboxEntity).insert({
      id: randomUUID(),
      routingKey: key,
      payload,
      // Saved with the row so the relay can continue this request's trace when it publishes later.
      traceHeaders: captureTraceHeaders(),
      createdAt: new Date(),
      publishedAt: null,
      attempts: 0,
      lastError: null,
    })
  }
}

@Injectable()
export class TypeOrmUnitOfWork implements UnitOfWork {
  constructor(@Inject(DATA_SOURCE) private readonly dataSource: DataSource) {}

  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.dataSource.transaction((em) =>
      work({
        watches: new TypeOrmWatchRepository(em),
        observations: new TypeOrmObservationRepository(em),
        alerts: new TypeOrmAlertRepository(em),
        outbox: new TypeOrmOutbox(em),
      }),
    )
  }
}
