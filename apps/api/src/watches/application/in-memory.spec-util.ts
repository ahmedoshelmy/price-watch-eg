import type { EventMap, RoutingKey } from '@price-watch/contracts'
import type { PastLow } from '../domain/drop-rule'
import type { Observation, ObservationSnapshot } from '../domain/observation'
import { Watch, type WatchSnapshot } from '../domain/watch'
import type { Transaction, UnitOfWork } from './ports'

/** In-memory adapters for application-layer tests; commit-or-rollback like the real unit of work. */
export class InMemoryStore implements UnitOfWork {
  watches = new Map<string, WatchSnapshot>()
  observations: ObservationSnapshot[] = []
  alertKeys = new Set<string>()
  outbox: Array<{ key: RoutingKey; payload: EventMap[RoutingKey] }> = []

  async run<T>(work: (tx: Transaction) => Promise<T>): Promise<T> {
    const draft = {
      watches: new Map(this.watches),
      observations: [...this.observations],
      alertKeys: new Set(this.alertKeys),
      outbox: [...this.outbox],
    }
    const tx: Transaction = {
      watches: {
        get: async (id) => {
          const s = draft.watches.get(id)
          return s ? Watch.restore(s) : null
        },
        add: async (w) => void draft.watches.set(w.id, w.snapshot()),
        save: async (w) => void draft.watches.set(w.id, w.snapshot()),
        remove: async (id) => draft.watches.delete(id),
      },
      observations: {
        existsForCheck: async (checkId) => draft.observations.some((o) => o.checkId === checkId),
        healthyLowsSince: async (watchId, since): Promise<PastLow[]> =>
          draft.observations
            .filter((o) => o.watchId === watchId && o.healthy && o.lowest && o.observedAt >= since)
            .map((o) => ({ observedAt: o.observedAt, lowestPiastres: o.lowest?.pricePiastres ?? 0 })),
        add: async (o: Observation) => void draft.observations.push(o.snapshot()),
      },
      alerts: {
        tryAdd: async (a) => {
          if (draft.alertKeys.has(a.key)) return false
          draft.alertKeys.add(a.key)
          return true
        },
      },
      outbox: {
        add: async (key, payload) => void draft.outbox.push({ key, payload }),
      },
    }
    const result = await work(tx)
    Object.assign(this, draft)
    return result
  }

  published<K extends RoutingKey>(key: K): Array<EventMap[K]> {
    return this.outbox.filter((m) => m.key === key).map((m) => m.payload as EventMap[K])
  }
}

export function sequentialIds(prefix = 'id'): { next: () => string } {
  let n = 0
  return { next: () => `${prefix}-${++n}` }
}
