# 3. Alert idempotency and the transactional outbox

Date: 2026-11-20

## Status

Accepted

## Context

Messages are delivered at least once: RabbitMQ redelivers unacknowledged messages, the outbox relay may publish
a row twice if it crashes between the broker confirm and marking the row, and two scheduler passes can request
the same check. A duplicate price alert is the most visible failure this product can have.

## Decision

- **State and events commit together.** Use cases write their events to an `outbox` table in the same Postgres
  transaction as the state change. `OutboxRelay` publishes pending rows with `FOR UPDATE SKIP LOCKED` (safe with
  several API replicas) and marks them published only after a publisher confirm. The trace context is stored with
  the row so the published message continues the original request's trace.
- **Observations are idempotent by `checkId`** (unique column): a redelivered `PriceObserved` is skipped.
- **Alerts are idempotent by key** `watchId:YYYY-MM-DD (Africa/Cairo):pricePiastres` (unique column, `INSERT ...
  ON CONFLICT DO NOTHING`). Different checks that see the same drop on the same day produce one alert; a further
  drop to a new price or a drop on a new day is a new alert.
- **The drop rule only fires on a change**: below-target alerts need the price to be lower than the previous healthy
  check (or be the first check), so a price that stays low does not alert every day.
- Consumers that throw dead-letter the message (no hot retry loop); the store, not the broker, guarantees
  exactly-once effects.

## Consequences

- Effects are exactly-once while delivery stays at-least-once; no distributed transaction needed.
- The Cairo calendar day is a product decision: "one alert per price per day" matches how people shop.
- Published outbox rows are kept for audit; a retention job is future work.
