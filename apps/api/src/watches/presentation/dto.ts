import { IsBoolean, IsNumber, IsOptional, IsPositive, IsString, Length } from 'class-validator'
import type { HistoryPoint, WatchView } from '../application/read-models'
import { piastresToEgp } from '../domain/money'
import type { Offer } from '../domain/observation'
import type { WatchSnapshot } from '../domain/watch'

export class CreateWatchDto {
  @IsString()
  @Length(2, 120)
  query!: string

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetEgp!: number
}

export class UpdateWatchDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetEgp?: number

  @IsOptional()
  @IsBoolean()
  active?: boolean
}

/** REST speaks EGP (what people type and read); the domain keeps integer piastres. */
export interface OfferJson {
  shop: string
  title: string
  priceEgp: number
  url: string
  inStock: boolean
}

export interface WatchJson {
  id: string
  query: string
  targetEgp: number
  active: boolean
  createdAt: string
  lastCheckedAt: string | null
  latest: { observedAt: string; healthy: boolean; lowest: OfferJson | null } | null
  lowest30dEgp: number | null
}

export interface HistoryPointJson {
  checkId: string
  observedAt: string
  lowest: OfferJson | null
  healthy: boolean
  dropped: boolean
  dropReasons: string[]
  shops: HistoryPoint['shops']
}

export function offerJson(offer: Offer | null): OfferJson | null {
  if (!offer) return null
  const { pricePiastres, ...rest } = offer
  return { ...rest, priceEgp: piastresToEgp(pricePiastres) }
}

export function watchJson(view: WatchView): WatchJson {
  return {
    id: view.id,
    query: view.query,
    targetEgp: piastresToEgp(view.targetPiastres),
    active: view.active,
    createdAt: view.createdAt.toISOString(),
    lastCheckedAt: view.lastCheckedAt?.toISOString() ?? null,
    latest: view.latest
      ? {
          observedAt: view.latest.observedAt.toISOString(),
          healthy: view.latest.healthy,
          lowest: offerJson(view.latest.lowest),
        }
      : null,
    lowest30dEgp: view.lowest30dPiastres === null ? null : piastresToEgp(view.lowest30dPiastres),
  }
}

export function snapshotJson(snapshot: WatchSnapshot): WatchJson {
  return watchJson({ ...snapshot, latest: null, lowest30dPiastres: null })
}

export function historyJson(point: HistoryPoint): HistoryPointJson {
  return { ...point, observedAt: point.observedAt.toISOString(), lowest: offerJson(point.lowest) }
}
