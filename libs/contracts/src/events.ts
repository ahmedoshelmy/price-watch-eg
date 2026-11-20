/**
 * Integration events exchanged over RabbitMQ. Past-tense facts (except the CheckRequested command),
 * versioned by additive change only. Money is always integer EGP piastres.
 */

export const EXCHANGE = 'price-watch.events'

export const RoutingKeys = {
  checkRequested: 'check.requested',
  priceObserved: 'price.observed',
  priceDropped: 'price.dropped',
} as const

export type RoutingKey = (typeof RoutingKeys)[keyof typeof RoutingKeys]

export type ShopStatusName = 'found' | 'none' | 'failed' | 'blocked'

export interface OfferDto {
  shop: string
  title: string
  pricePiastres: number
  url: string
  inStock: boolean
}

export interface ShopOutcomeDto {
  shop: string
  status: ShopStatusName
  error?: string
}

/** Ask the checker to search the shops for one watch. */
export interface CheckRequested {
  checkId: string
  watchId: string
  query: string
  requestedAt: string
}

/** What one check saw. Shops that failed are listed in `shops` with their status, never silently dropped. */
export interface PriceObserved {
  checkId: string
  watchId: string
  query: string
  observedAt: string
  offers: OfferDto[]
  shops: ShopOutcomeDto[]
}

export type DropReason = 'below-target' | 'thirty-day-low'

/** The lowest in-stock price for a watch dropped (below its target and/or to a new 30-day low). */
export interface PriceDropped {
  alertKey: string
  watchId: string
  query: string
  pricePiastres: number
  targetPiastres: number
  shop: string
  url: string
  reasons: DropReason[]
  observedAt: string
}

export interface EventMap {
  'check.requested': CheckRequested
  'price.observed': PriceObserved
  'price.dropped': PriceDropped
}
