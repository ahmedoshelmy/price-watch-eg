import type { DropReason } from '../domain/drop-rule'
import type { Offer, ShopOutcome } from '../domain/observation'

/** Query side (CQRS-lite): flat views read straight from the store, no aggregates involved. */
export interface WatchView {
  id: string
  query: string
  targetPiastres: number
  active: boolean
  createdAt: Date
  lastCheckedAt: Date | null
  latest: { observedAt: Date; lowest: Offer | null; healthy: boolean } | null
  lowest30dPiastres: number | null
}

export interface HistoryPoint {
  checkId: string
  observedAt: Date
  lowest: Offer | null
  healthy: boolean
  dropped: boolean
  dropReasons: DropReason[]
  shops: ShopOutcome[]
}

export interface DueWatch {
  watchId: string
  query: string
}

export interface WatchQueries {
  list(): Promise<WatchView[]>
  get(id: string): Promise<WatchView | null>
  history(watchId: string, since: Date): Promise<HistoryPoint[]>
  due(now: Date, intervalMs: number, limit: number): Promise<DueWatch[]>
}
