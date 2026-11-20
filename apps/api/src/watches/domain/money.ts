import { DomainError } from './errors'

/** EGP amounts live as integer piastres (1 EGP = 100 piastres) so comparisons never suffer float drift. */
export type Piastres = number

export const MAX_PIASTRES = 1_000_000_000 // 10 million EGP: anything above is a typo, not a product.

export function egpToPiastres(egp: number): Piastres {
  if (!Number.isFinite(egp) || egp <= 0) throw new DomainError('A price must be a positive amount of EGP')
  const piastres = Math.round(egp * 100)
  if (piastres > MAX_PIASTRES) throw new DomainError('A price must be under 10,000,000 EGP')
  return piastres
}

export function piastresToEgp(piastres: Piastres): number {
  return piastres / 100
}
