export interface Offer {
  shop: string
  title: string
  priceEgp: number
  url: string
  inStock: boolean
}

export interface Watch {
  id: string
  query: string
  targetEgp: number
  active: boolean
  createdAt: string
  lastCheckedAt: string | null
  latest: { observedAt: string; healthy: boolean; lowest: Offer | null } | null
  lowest30dEgp: number | null
}

export interface HistoryPoint {
  checkId: string
  observedAt: string
  lowest: Offer | null
  healthy: boolean
  dropped: boolean
  dropReasons: string[]
  shops: Array<{ shop: string; status: string; error?: string }>
}

/** PriceDropped as pushed over the `/prices` socket (amounts in piastres, like on the bus). */
export interface PriceDroppedEvent {
  alertKey: string
  watchId: string
  query: string
  pricePiastres: number
  targetPiastres: number
  shop: string
  url: string
  reasons: Array<'below-target' | 'thirty-day-low'>
  observedAt: string
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const problem = (await response.json().catch(() => null)) as { detail?: string } | null
    throw new Error(problem?.detail ?? `Request failed (${response.status})`)
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}

export const api = {
  list: () => call<Watch[]>('/api/watches'),
  create: (query: string, targetEgp: number) =>
    call<Watch>('/api/watches', { method: 'POST', body: JSON.stringify({ query, targetEgp }) }),
  update: (id: string, change: { targetEgp?: number; active?: boolean }) =>
    call<Watch>(`/api/watches/${id}`, { method: 'PATCH', body: JSON.stringify(change) }),
  remove: (id: string) => call<void>(`/api/watches/${id}`, { method: 'DELETE' }),
  checkNow: (id: string) => call<{ checkId: string }>(`/api/watches/${id}/check`, { method: 'POST' }),
  history: (id: string, days = 30) => call<HistoryPoint[]>(`/api/watches/${id}/history?days=${days}`),
}
