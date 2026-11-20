import { EntitySchema } from 'typeorm'
import type { Offer, ShopOutcome } from '../../domain/observation'

/** Persistence rows: plain shapes owned by the infrastructure layer, mapped to and from the domain by hand. */
export interface WatchRow {
  id: string
  query: string
  targetPiastres: number
  active: boolean
  createdAt: Date
  lastCheckedAt: Date | null
}

export interface ObservationRow {
  id: string
  watchId: string
  checkId: string
  observedAt: Date
  lowestPiastres: number | null
  lowestOffer: Offer | null
  healthy: boolean
  dropReasons: string[]
  offers: Offer[]
  shops: ShopOutcome[]
}

export interface AlertRow {
  id: string
  alertKey: string
  watchId: string
  pricePiastres: number
  reasons: string[]
  createdAt: Date
}

export interface OutboxRow {
  id: string
  routingKey: string
  payload: unknown
  traceHeaders: Record<string, string>
  createdAt: Date
  publishedAt: Date | null
  attempts: number
  lastError: string | null
}

export const WatchEntity = new EntitySchema<WatchRow>({
  name: 'Watch',
  tableName: 'watches',
  columns: {
    id: { type: 'uuid', primary: true },
    query: { type: 'varchar', length: 120 },
    targetPiastres: { name: 'target_piastres', type: 'integer' },
    active: { type: 'boolean' },
    createdAt: { name: 'created_at', type: 'timestamptz' },
    lastCheckedAt: { name: 'last_checked_at', type: 'timestamptz', nullable: true },
  },
})

export const ObservationEntity = new EntitySchema<ObservationRow>({
  name: 'Observation',
  tableName: 'observations',
  columns: {
    id: { type: 'uuid', primary: true },
    watchId: { name: 'watch_id', type: 'uuid' },
    checkId: { name: 'check_id', type: 'uuid', unique: true },
    observedAt: { name: 'observed_at', type: 'timestamptz' },
    lowestPiastres: { name: 'lowest_piastres', type: 'integer', nullable: true },
    lowestOffer: { name: 'lowest_offer', type: 'jsonb', nullable: true },
    healthy: { type: 'boolean' },
    dropReasons: { name: 'drop_reasons', type: 'jsonb' },
    offers: { type: 'jsonb' },
    shops: { type: 'jsonb' },
  },
})

export const AlertEntity = new EntitySchema<AlertRow>({
  name: 'Alert',
  tableName: 'alerts',
  columns: {
    id: { type: 'uuid', primary: true },
    alertKey: { name: 'alert_key', type: 'varchar', length: 200, unique: true },
    watchId: { name: 'watch_id', type: 'uuid' },
    pricePiastres: { name: 'price_piastres', type: 'integer' },
    reasons: { type: 'jsonb' },
    createdAt: { name: 'created_at', type: 'timestamptz' },
  },
})

export const OutboxEntity = new EntitySchema<OutboxRow>({
  name: 'OutboxMessage',
  tableName: 'outbox',
  columns: {
    id: { type: 'uuid', primary: true },
    routingKey: { name: 'routing_key', type: 'varchar', length: 100 },
    payload: { type: 'jsonb' },
    traceHeaders: { name: 'trace_headers', type: 'jsonb' },
    createdAt: { name: 'created_at', type: 'timestamptz' },
    publishedAt: { name: 'published_at', type: 'timestamptz', nullable: true },
    attempts: { type: 'integer', default: 0 },
    lastError: { name: 'last_error', type: 'text', nullable: true },
  },
})

export const ENTITIES = [WatchEntity, ObservationEntity, AlertEntity, OutboxEntity]
