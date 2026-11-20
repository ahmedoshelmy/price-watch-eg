import type { ShopResultMessage } from '@price-watch/contracts'

/** Port: something that can search Egyptian shops for a product and yield one result per shop as it answers. */
export interface ShopCatalog {
  readonly mode: 'fake' | 'live'
  search(query: string, shops: string[]): AsyncIterable<ShopResultMessage>
}

export const SHOP_CATALOG = Symbol('ShopCatalog')

/** Turns an EGP amount (possibly fractional) into integer piastres. */
export function toPiastres(egp: number): number {
  return Math.round(egp * 100)
}
