import type { MigrationInterface, QueryRunner } from 'typeorm'

/** Scheduler leases: when a check was last handed out, so concurrent schedulers never double-request it. */
export class ClaimableChecks1763800000000 implements MigrationInterface {
  name = 'ClaimableChecks1763800000000'

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE watches ADD COLUMN check_requested_at timestamptz`)
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE watches DROP COLUMN check_requested_at`)
  }
}
