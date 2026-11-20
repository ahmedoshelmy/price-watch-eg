import { Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { HistoryPoint, WatchQueries, WatchView } from '../../application/read-models'
import type { DropReason } from '../../domain/drop-rule'
import type { Offer, ShopOutcome } from '../../domain/observation'
import { DATA_SOURCE } from './typeorm-unit-of-work'

interface WatchViewRow {
  id: string
  query: string
  target_piastres: number
  active: boolean
  created_at: Date
  last_checked_at: Date | null
  latest_observed_at: Date | null
  latest_offer: Offer | null
  latest_healthy: boolean | null
  lowest_30d: number | null
}

const WATCH_VIEW_SQL = `
  SELECT w.id, w.query, w.target_piastres, w.active, w.created_at, w.last_checked_at,
         l.observed_at AS latest_observed_at, l.lowest_offer AS latest_offer, l.healthy AS latest_healthy,
         (SELECT min(o.lowest_piastres) FROM observations o
           WHERE o.watch_id = w.id AND o.healthy AND o.observed_at >= now() - interval '30 days') AS lowest_30d
    FROM watches w
    LEFT JOIN LATERAL (
      SELECT observed_at, lowest_offer, healthy FROM observations o
       WHERE o.watch_id = w.id ORDER BY o.observed_at DESC LIMIT 1
    ) l ON true`

function toView(r: WatchViewRow): WatchView {
  return {
    id: r.id,
    query: r.query,
    targetPiastres: r.target_piastres,
    active: r.active,
    createdAt: r.created_at,
    lastCheckedAt: r.last_checked_at,
    latest: r.latest_observed_at
      ? { observedAt: r.latest_observed_at, lowest: r.latest_offer, healthy: r.latest_healthy ?? false }
      : null,
    lowest30dPiastres: r.lowest_30d,
  }
}

/** Read side: hand-written SQL shaped for the screens, bypassing the aggregates. */
@Injectable()
export class TypeOrmWatchQueries implements WatchQueries {
  constructor(@Inject(DATA_SOURCE) private readonly db: DataSource) {}

  async list(): Promise<WatchView[]> {
    const rows: WatchViewRow[] = await this.db.query(`${WATCH_VIEW_SQL} ORDER BY w.created_at DESC`)
    return rows.map(toView)
  }

  async get(id: string): Promise<WatchView | null> {
    const rows: WatchViewRow[] = await this.db.query(`${WATCH_VIEW_SQL} WHERE w.id = $1`, [id])
    return rows[0] ? toView(rows[0]) : null
  }

  async history(watchId: string, since: Date): Promise<HistoryPoint[]> {
    const rows: Array<{
      check_id: string
      observed_at: Date
      lowest_offer: Offer | null
      healthy: boolean
      drop_reasons: DropReason[]
      shops: ShopOutcome[]
    }> = await this.db.query(
      `SELECT check_id, observed_at, lowest_offer, healthy, drop_reasons, shops FROM observations
        WHERE watch_id = $1 AND observed_at >= $2 ORDER BY observed_at ASC`,
      [watchId, since],
    )
    return rows.map((r) => ({
      checkId: r.check_id,
      observedAt: r.observed_at,
      lowest: r.lowest_offer,
      healthy: r.healthy,
      dropped: r.drop_reasons.length > 0,
      dropReasons: r.drop_reasons,
      shops: r.shops,
    }))
  }
}
