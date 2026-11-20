import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Hand-written so the schema is reviewable SQL; runs automatically at start-up (migrationsRun). */
export class InitialSchema1763700000000 implements MigrationInterface {
  name = 'InitialSchema1763700000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE watches (
        id uuid PRIMARY KEY,
        query varchar(120) NOT NULL,
        target_piastres integer NOT NULL CHECK (target_piastres > 0),
        active boolean NOT NULL,
        created_at timestamptz NOT NULL,
        last_checked_at timestamptz
      )`)
    await q.query(`CREATE INDEX ix_watches_due ON watches (last_checked_at NULLS FIRST) WHERE active`)
    await q.query(`
      CREATE TABLE observations (
        id uuid PRIMARY KEY,
        watch_id uuid NOT NULL REFERENCES watches (id) ON DELETE CASCADE,
        check_id uuid NOT NULL UNIQUE,
        observed_at timestamptz NOT NULL,
        lowest_piastres integer,
        lowest_offer jsonb,
        healthy boolean NOT NULL,
        drop_reasons jsonb NOT NULL DEFAULT '[]',
        offers jsonb NOT NULL,
        shops jsonb NOT NULL
      )`)
    await q.query(`CREATE INDEX ix_observations_watch_time ON observations (watch_id, observed_at)`)
    await q.query(`
      CREATE TABLE alerts (
        id uuid PRIMARY KEY,
        alert_key varchar(200) NOT NULL UNIQUE,
        watch_id uuid NOT NULL REFERENCES watches (id) ON DELETE CASCADE,
        price_piastres integer NOT NULL,
        reasons jsonb NOT NULL,
        created_at timestamptz NOT NULL
      )`)
    await q.query(`
      CREATE TABLE outbox (
        id uuid PRIMARY KEY,
        routing_key varchar(100) NOT NULL,
        payload jsonb NOT NULL,
        trace_headers jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL,
        published_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        last_error text
      )`)
    await q.query(`CREATE INDEX ix_outbox_pending ON outbox (created_at) WHERE published_at IS NULL`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE outbox`)
    await q.query(`DROP TABLE alerts`)
    await q.query(`DROP TABLE observations`)
    await q.query(`DROP TABLE watches`)
  }
}
