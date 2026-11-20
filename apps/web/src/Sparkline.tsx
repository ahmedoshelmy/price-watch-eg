import { useEffect, useState } from 'react'
import { api, type HistoryPoint } from './api'
import { formatEgp, shopName, sparkline } from './format'

const W = 240
const H = 56

/** 30-day lowest-price history; drops are dots, failed checks leave gaps, the dashed line is the target. */
export function Sparkline({
  watchId,
  targetEgp,
  version,
}: {
  watchId: string
  targetEgp: number
  version: number
}) {
  const [history, setHistory] = useState<HistoryPoint[] | null>(null)

  useEffect(() => {
    let live = true
    api.history(watchId).then(
      (h) => live && setHistory(h),
      () => live && setHistory([]),
    )
    return () => {
      live = false
    }
  }, [watchId, version])

  if (history === null) return <div className="spark spark--empty">Loading history…</div>
  const values = history.map((h) => ({
    price: h.healthy ? (h.lowest?.priceEgp ?? null) : null,
    dropped: h.dropped,
  }))
  const { points, targetY } = sparkline(values, W, H, targetEgp)
  if (points.length < 2) return <div className="spark spark--empty">History builds up with each check</div>

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const last = history.at(-1)
  return (
    <figure className="spark">
      <svg
        viewBox={`-4 -4 ${W + 8} ${H + 8}`}
        role="img"
        aria-label={`Lowest price over ${history.length} checks`}
      >
        {targetY !== null && <line className="spark__target" x1={0} x2={W} y1={targetY} y2={targetY} />}
        <path className="spark__line" d={path} />
        {points
          .filter((p) => p.dropped)
          .map((p) => (
            <circle key={`${p.x}-${p.y}`} className="spark__drop" cx={p.x} cy={p.y} r={3.5} />
          ))}
      </svg>
      <figcaption>
        {history.length} checks · last:{' '}
        {last?.lowest ? `${formatEgp(last.lowest.priceEgp)} at ${shopName(last.lowest.shop)}` : 'no offer'}
      </figcaption>
    </figure>
  )
}
