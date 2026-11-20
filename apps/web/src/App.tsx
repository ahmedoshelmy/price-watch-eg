import { useCallback, useEffect, useState } from 'react'
import { api, type Watch } from './api'
import { AddWatchForm } from './AddWatchForm'
import { formatEgp, piastresToEgp, reasonText, shopName } from './format'
import { useDropAlerts } from './useDropAlerts'
import { WatchCard } from './WatchCard'

const REFRESH_MS = 15_000

export function App() {
  const [watches, setWatches] = useState<Watch[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const refresh = useCallback(() => {
    api.list().then(
      (list) => {
        setWatches(list)
        setVersion((v) => v + 1)
        setError(null)
      },
      (err: unknown) => setError(err instanceof Error ? err.message : String(err)),
    )
  }, [])

  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const { toasts, dismiss, connected } = useDropAlerts(refresh)

  return (
    <div className="page">
      <header className="top">
        <div>
          <h1>Price Watch EG</h1>
          <p>
            Watch a product across Egyptian shops. Get told live when it drops under your price or hits a
            30-day low.
          </p>
        </div>
        <span className={`live ${connected ? 'live--on' : ''}`}>{connected ? 'live' : 'offline'}</span>
      </header>

      <AddWatchForm onAdded={refresh} onError={setError} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <main className="grid">
        {watches === null && <p className="muted">Loading…</p>}
        {watches?.length === 0 && <p className="muted">Nothing watched yet. Add a product above.</p>}
        {watches?.map((w) => (
          <WatchCard key={w.id} watch={w} version={version} onChanged={refresh} onError={setError} />
        ))}
      </main>

      <section className="toasts" aria-live="polite">
        {toasts.map(({ id, event }) => (
          <div key={id} className="toast">
            <strong>{event.query}</strong> is {formatEgp(piastresToEgp(event.pricePiastres))} at{' '}
            {shopName(event.shop)}: {reasonText(event.reasons)}.{' '}
            <a href={event.url} target="_blank" rel="noreferrer noopener">
              Open offer
            </a>
            <button aria-label="Dismiss" onClick={() => dismiss(id)}>
              ×
            </button>
          </div>
        ))}
      </section>
    </div>
  )
}
