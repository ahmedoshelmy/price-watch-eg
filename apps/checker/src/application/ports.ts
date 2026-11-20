import type { EventMap, RoutingKey, ShopOutcomeDto, OfferDto } from '@price-watch/contracts'

export interface ScrapeResult {
  offers: OfferDto[]
  shops: ShopOutcomeDto[]
  /** Set when the call itself failed or hit its deadline; `shops` then holds whatever arrived before. */
  error?: string
}

/** Port to the scraper sidecar. Never throws for scraping failures: they are data, reported in the result. */
export interface ScraperClient {
  search(query: string, deadlineMs: number): Promise<ScrapeResult>
}

export interface DueWatchSource {
  due(intervalSeconds: number, limit: number): Promise<Array<{ watchId: string; query: string }>>
}

export interface EventPublisher {
  publish<K extends RoutingKey>(key: K, payload: EventMap[K]): Promise<void>
}

export const SCRAPER_CLIENT = Symbol('ScraperClient')
export const DUE_WATCH_SOURCE = Symbol('DueWatchSource')
export const EVENT_PUBLISHER = Symbol('EventPublisher')
export const CLOCK = Symbol('Clock')
export const ID_GENERATOR = Symbol('IdGenerator')

export interface Clock {
  now(): Date
}

export interface IdGenerator {
  next(): string
}
