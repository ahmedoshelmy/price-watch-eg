import type { Piastres } from './money'

export interface Offer {
  shop: string
  title: string
  pricePiastres: Piastres
  url: string
  inStock: boolean
}

export type ShopStatus = 'found' | 'none' | 'failed' | 'blocked'

export interface ShopOutcome {
  shop: string
  status: ShopStatus
  error?: string
}

/** Fewer answering shops than this and the check is too thin to judge a price by. */
export const MIN_ANSWERING_SHOPS = 2

export interface ObservationSnapshot {
  id: string
  watchId: string
  checkId: string
  observedAt: Date
  offers: Offer[]
  shops: ShopOutcome[]
  lowest: Offer | null
  healthy: boolean
  dropReasons: string[]
}

/**
 * What one check of one watch saw. The lowest price only counts in-stock, positively priced offers.
 * A check is healthy when at least two shops answered and no more than half failed: scraping is unreliable,
 * and a thin or mostly-failed check must never be read as a price movement.
 */
export class Observation {
  private constructor(private readonly state: ObservationSnapshot) {}

  static fromCheck(input: {
    id: string
    watchId: string
    checkId: string
    observedAt: Date
    offers: Offer[]
    shops: ShopOutcome[]
  }): Observation {
    const answered = input.shops.filter((s) => s.status === 'found' || s.status === 'none').length
    const failed = input.shops.length - answered
    const healthy = answered >= MIN_ANSWERING_SHOPS && failed * 2 <= input.shops.length
    const lowest =
      input.offers
        .filter((o) => o.inStock && Number.isInteger(o.pricePiastres) && o.pricePiastres > 0)
        .sort((a, b) => a.pricePiastres - b.pricePiastres)[0] ?? null
    return new Observation({ ...input, lowest, healthy, dropReasons: [] })
  }

  static restore(snapshot: ObservationSnapshot): Observation {
    return new Observation({ ...snapshot })
  }

  get lowest(): Offer | null {
    return this.state.lowest
  }

  get healthy(): boolean {
    return this.state.healthy
  }

  get observedAt(): Date {
    return this.state.observedAt
  }

  flagDrop(reasons: string[]): void {
    this.state.dropReasons = [...reasons]
  }

  snapshot(): ObservationSnapshot {
    return { ...this.state, offers: [...this.state.offers], shops: [...this.state.shops] }
  }
}
