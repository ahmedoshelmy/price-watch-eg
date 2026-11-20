import { useState } from 'react'
import { api, type Watch } from './api'
import { formatEgp, shopName, timeAgo } from './format'
import { Sparkline } from './Sparkline'

interface Props {
  watch: Watch
  version: number
  onChanged: () => void
  onError: (message: string) => void
}

export function WatchCard({ watch, version, onChanged, onError }: Props) {
  const [busy, setBusy] = useState(false)
  const lowest = watch.latest?.lowest ?? null
  const underTarget = lowest !== null && lowest.priceEgp <= watch.targetEgp

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await action()
      onChanged()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={`card ${watch.active ? '' : 'card--paused'}`}>
      <header className="card__head">
        <h2>{watch.query}</h2>
        <span className="card__target">target {formatEgp(watch.targetEgp)}</span>
      </header>

      <div className="card__price">
        {lowest ? (
          <>
            <span className={`price ${underTarget ? 'price--hit' : ''}`}>{formatEgp(lowest.priceEgp)}</span>
            <a className="card__offer" href={lowest.url} target="_blank" rel="noreferrer noopener">
              cheapest at {shopName(lowest.shop)} ↗
            </a>
          </>
        ) : (
          <span className="price price--none">
            {watch.latest ? 'No in-stock offer' : 'Waiting for the first check…'}
          </span>
        )}
      </div>

      <dl className="card__facts">
        <div>
          <dt>30-day low</dt>
          <dd>{watch.lowest30dEgp === null ? '–' : formatEgp(watch.lowest30dEgp)}</dd>
        </div>
        <div>
          <dt>Checked</dt>
          <dd>
            {watch.lastCheckedAt ? timeAgo(watch.lastCheckedAt) : 'never'}
            {watch.latest && !watch.latest.healthy && (
              <span className="badge" title="Too many shops failed; this check cannot alert">
                partial
              </span>
            )}
          </dd>
        </div>
      </dl>

      <Sparkline watchId={watch.id} targetEgp={watch.targetEgp} version={version} />

      <footer className="card__actions">
        <button disabled={busy || !watch.active} onClick={() => run(() => api.checkNow(watch.id))}>
          Check now
        </button>
        <button disabled={busy} onClick={() => run(() => api.update(watch.id, { active: !watch.active }))}>
          {watch.active ? 'Pause' : 'Resume'}
        </button>
        <button className="danger" disabled={busy} onClick={() => run(() => api.remove(watch.id))}>
          Remove
        </button>
      </footer>
    </article>
  )
}
