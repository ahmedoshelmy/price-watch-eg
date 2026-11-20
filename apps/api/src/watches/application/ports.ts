import type { EventMap, PriceDropped, RoutingKey } from '@price-watch/contracts'
import type { PastLow } from '../domain/drop-rule'
import type { Observation } from '../domain/observation'
import type { Watch } from '../domain/watch'
import type { DueWatch } from './read-models'

export interface WatchRepository {
  get(id: string): Promise<Watch | null>
  add(watch: Watch): Promise<void>
  save(watch: Watch): Promise<void>
  remove(id: string): Promise<boolean>
}

export interface ObservationRepository {
  existsForCheck(checkId: string): Promise<boolean>
  /** Lowest prices of healthy checks of a watch observed at or after `since`. */
  healthyLowsSince(watchId: string, since: Date): Promise<PastLow[]>
  add(observation: Observation): Promise<void>
}

export interface AlertRepository {
  /** Stores the alert unless one with the same key exists; true when this call stored it. */
  tryAdd(alert: {
    id: string
    key: string
    watchId: string
    pricePiastres: number
    reasons: string[]
    createdAt: Date
  }): Promise<boolean>
}

/** Transactional outbox: events written in the same transaction as the state change, published later by a relay. */
export interface Outbox {
  add<K extends RoutingKey>(key: K, payload: EventMap[K]): Promise<void>
}

export interface Transaction {
  watches: WatchRepository
  observations: ObservationRepository
  alerts: AlertRepository
  outbox: Outbox
}

export interface UnitOfWork {
  run<T>(work: (tx: Transaction) => Promise<T>): Promise<T>
}

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): string
}

export const UNIT_OF_WORK = Symbol('UnitOfWork')
export const CLOCK = Symbol('Clock')
export const ID_GENERATOR = Symbol('IdGenerator')
export const WATCH_QUERIES = Symbol('WatchQueries')

/**
 * Hands out due watches to schedulers as short leases: a claimed watch is not handed out again until it has been
 * checked or `leaseMs` has passed, so several checker replicas never request the same check twice.
 */
export interface DueWatchClaims {
  claim(now: Date, leaseMs: number, limit: number): Promise<DueWatch[]>
}

export const DUE_WATCH_CLAIMS = Symbol('DueWatchClaims')

/** Tells connected clients about a drop right away (WebSocket gateway in production). */
export interface DropNotifier {
  notify(event: PriceDropped): Promise<void>
}

export const DROP_NOTIFIER = Symbol('DropNotifier')
