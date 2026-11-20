import { Inject, Injectable } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { DueWatchClaims } from '../../application/ports'
import type { DueWatch } from '../../application/read-models'
import { DATA_SOURCE } from './typeorm-unit-of-work'

/**
 * One statement claims the batch: rows locked by a concurrent claim are skipped (`SKIP LOCKED`), and the
 * `check_requested_at` stamp keeps them out of later claims until the lease runs out.
 */
@Injectable()
export class TypeOrmDueWatchClaims implements DueWatchClaims {
  constructor(@Inject(DATA_SOURCE) private readonly db: DataSource) {}

  async claim(now: Date, leaseMs: number, limit: number): Promise<DueWatch[]> {
    const cutoff = new Date(now.getTime() - leaseMs)
    const [rows]: [Array<{ id: string; query: string }>, number] = await this.db.query(
      `UPDATE watches SET check_requested_at = $1
        WHERE id IN (
          SELECT id FROM watches
           WHERE active
             AND (last_checked_at IS NULL OR last_checked_at <= $2)
             AND (check_requested_at IS NULL OR check_requested_at <= $2)
           ORDER BY last_checked_at NULLS FIRST
           LIMIT $3
           FOR UPDATE SKIP LOCKED)
        RETURNING id, query`,
      [now, cutoff, limit],
    )
    return rows.map((r) => ({ watchId: r.id, query: r.query }))
  }
}
