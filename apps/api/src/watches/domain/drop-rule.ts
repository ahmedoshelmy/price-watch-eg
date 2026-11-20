import type { Piastres } from './money'
import type { Observation, Offer } from './observation'

export type DropReason = 'below-target' | 'thirty-day-low'

/** Lowest in-stock price of an earlier healthy check of the same watch. */
export interface PastLow {
  observedAt: Date
  lowestPiastres: Piastres
}

export interface DropDecision {
  reasons: DropReason[]
  offer: Offer
  alertKey: string
}

export const LOOKBACK_DAYS = 30
/** A "30-day low" needs a few earlier checks; on day one every price is a record low. */
export const MIN_HISTORY_FOR_LOW = 3

const DAY_MS = 86_400_000

/**
 * Idempotency key of an alert: one alert per watch, Cairo calendar day and price. A redelivered message,
 * a duplicate check or a second checker replica produce the same key, and the store keeps only the first.
 */
export function alertKey(watchId: string, observedAt: Date, pricePiastres: Piastres): string {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(observedAt)
  return `${watchId}:${day}:${pricePiastres}`
}

/**
 * Decides whether a check is a price drop worth telling someone about.
 * - Never for paused watches, unhealthy checks (thin or mostly failed) or checks without an in-stock offer.
 * - below-target: the lowest price is at or under the target AND lower than the previous healthy check's
 *   (or it is the first one), so a price that just stays low does not alert every day.
 * - thirty-day-low: lower than every healthy check of the last 30 days, given at least three of them.
 */
export function evaluateDrop(input: {
  watch: { id: string; targetPiastres: Piastres; active: boolean }
  observation: Observation
  /** Earlier healthy checks, any order; older than 30 days are ignored. */
  history: PastLow[]
}): DropDecision | null {
  const { watch, observation } = input
  const offer = observation.lowest
  if (!watch.active || !observation.healthy || !offer) return null

  const since = observation.observedAt.getTime() - LOOKBACK_DAYS * DAY_MS
  const recent = input.history
    .filter((h) => h.observedAt.getTime() >= since && h.observedAt < observation.observedAt)
    .sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())
  const price = offer.pricePiastres
  const previous = recent.at(-1)

  const reasons: DropReason[] = []
  if (price <= watch.targetPiastres && (!previous || price < previous.lowestPiastres))
    reasons.push('below-target')
  if (recent.length >= MIN_HISTORY_FOR_LOW && price < Math.min(...recent.map((h) => h.lowestPiastres))) {
    reasons.push('thirty-day-low')
  }
  if (reasons.length === 0) return null
  return { reasons, offer, alertKey: alertKey(watch.id, observation.observedAt, price) }
}
