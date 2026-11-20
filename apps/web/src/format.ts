const egp = new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 })

export function formatEgp(amount: number): string {
  return egp.format(amount)
}

export function piastresToEgp(piastres: number): number {
  return piastres / 100
}

const SHOP_NAMES: Record<string, string> = {
  amazon: 'Amazon',
  noon: 'Noon',
  jumia: 'Jumia',
  btech: 'B.TECH',
  '2b': '2B',
  raya: 'Raya',
}

export function shopName(id: string): string {
  return SHOP_NAMES[id] ?? id
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  return `${Math.round(hours / 24)} d ago`
}

export interface SparkPoint {
  x: number
  y: number
  dropped: boolean
}

/**
 * Maps prices to SVG coordinates (y grows downwards). Missing prices (failed checks) are skipped,
 * a flat series sits in the middle, and the target line is included in the vertical scale when given.
 */
export function sparkline(
  values: Array<{ price: number | null; dropped: boolean }>,
  width: number,
  height: number,
  target?: number,
): { points: SparkPoint[]; targetY: number | null } {
  const priced = values
    .map((v, i) => ({ ...v, i }))
    .filter((v): v is { price: number; dropped: boolean; i: number } => v.price !== null)
  if (priced.length === 0) return { points: [], targetY: null }
  const all = target === undefined ? priced.map((v) => v.price) : [...priced.map((v) => v.price), target]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const pad = 3
  const y = (p: number): number =>
    max === min ? height / 2 : pad + ((max - p) / (max - min)) * (height - 2 * pad)
  const step = values.length > 1 ? width / (values.length - 1) : 0
  return {
    points: priced.map((v) => ({
      x: values.length > 1 ? v.i * step : width / 2,
      y: y(v.price),
      dropped: v.dropped,
    })),
    targetY: target === undefined ? null : y(target),
  }
}

export function reasonText(reasons: string[]): string {
  return reasons
    .map((r) => (r === 'below-target' ? 'under your target' : r === 'thirty-day-low' ? 'a 30-day low' : r))
    .join(' and ')
}
