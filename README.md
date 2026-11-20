# Price Watch EG

Watch a product across Egyptian online shops, keep its price history, and get told **live** when the lowest
in-stock offer drops under your target or hits a 30-day low.

Add "Logitech G102" with a target of 900 EGP. Price Watch searches the shops on a schedule, stores every check
(including the shops that failed), draws the 30-day history, links the cheapest offer, and pushes a toast to every
open browser the moment a real drop happens, once per price per day.

## What it shows

- **Polyglot-ready contract-first gRPC**: a scraper sidecar behind `scraper.proto` with server streaming and deadlines.
- **Messaging done safely**: transactional outbox, publisher confirms, competing consumers with prefetch limits,
  idempotent consumers, dead-lettering, fan-out to every API replica for WebSocket pushes.
- **Clean Architecture in NestJS**: pure TypeScript domain, use cases behind ports, adapters for TypeORM, RabbitMQ and
  gRPC, with the dependency rule enforced by lint.
- **One trace across HTTP -> AMQP -> gRPC** with OpenTelemetry (`traceparent` in AMQP headers, gRPC metadata and the
  outbox row).
- **Testcontainers** end-to-end test of the whole pipeline against real Postgres and RabbitMQ.

## Architecture

```mermaid
flowchart LR
  UI[React web<br/>nginx] -- REST /api --> API
  UI <-. socket.io /prices .-> API
  subgraph API[api - NestJS]
    direction TB
    C[WatchesController] --> UC[use cases]
    UC --> DB[(Postgres<br/>watches, observations,<br/>alerts, outbox)]
    R[Outbox relay] --> DB
  end
  R -- CheckRequested / PriceDropped --> MQ[(RabbitMQ<br/>topic exchange)]
  MQ -- CheckRequested --> CHK[checker - NestJS worker<br/>scheduler + consumer]
  CHK -- POST /internal/due-watches/claim --> API
  CHK -- gRPC Search, stream per shop, deadline --> SC[scraper - NestJS gRPC<br/>egypt-price-scraper]
  CHK -- PriceObserved --> MQ
  MQ -- PriceObserved --> API
  MQ -- PriceDropped fan-out --> API
```

The main flow:

1. `POST /api/watches` stores the watch and a `CheckRequested` event in **one transaction** (outbox).
2. The relay publishes it; one checker instance takes it (prefetch = its concurrency limit) and calls
   `Scraper.Search` with a deadline. Shop results stream back as each shop answers.
3. The checker publishes `PriceObserved` with every offer and every shop's outcome (`found`/`none`/`failed`/`blocked`).
4. The API stores the observation, runs the **drop rule**, and, if it fires and the alert key is new, stores the
   alert plus `PriceDropped` in the same transaction.
5. `PriceDropped` fans out to every API replica, which pushes it to browsers over socket.io.
6. Every minute the checker's scheduler claims the watches not checked within `CHECK_INTERVAL_SECONDS` and
   requests checks for them. A claim is a lease (`UPDATE ... FOR UPDATE SKIP LOCKED RETURNING`), so any number of
   checker replicas can run the scheduler without requesting the same check twice.

| Path | What |
|---|---|
| `libs/contracts` | Integration events (`CheckRequested`, `PriceObserved`, `PriceDropped`) and `proto/scraper.proto` |
| `libs/platform` | OpenTelemetry bootstrap, typed RabbitMQ bus (confirms, dead-letter queue, trace propagation) |
| `apps/api` | `domain/` Watch aggregate, Observation, drop rule; `application/` use cases + ports; `infrastructure/` TypeORM, outbox relay, subscriptions; `presentation/` REST, socket.io gateway, problem details |
| `apps/checker` | Scheduler, `CheckRequested` consumer, gRPC client with deadline |
| `apps/scraper` | gRPC sidecar: fake catalog (default) or the real `egypt-price-scraper`, behind a polite cache and concurrency cap |
| `apps/web` | React + Vite: watches, add form, sparkline history, cheapest offer link, live toasts |
| `tests/integration` | Testcontainers end-to-end test |
| `docs/adr` | Architecture decision records |

## Quickstart

Needs Docker (or Podman with the Docker CLI) and nothing else.

```bash
cp .env.example .env              # optional: every value has a local default
docker compose up -d --build --wait
./scripts/smoke.sh                # health checks + add a watch -> check -> drop flagged
# then open http://localhost:8085 for the web app
docker compose down -v
```

`SCRAPER_MODE=fake` (default) serves a deterministic invented catalog: prices drift a few percent per day and
roughly one shop in twelve "times out", so every behaviour is visible offline. `DEMO_DATA=true` seeds three demo
watches with 30 days of synthetic history. `SCRAPER_MODE=live` searches the real shops through
[`egypt-price-scraper`](https://github.com/ahmedoshelmy/egypt-price-scraper) (the image builds it from a pinned commit).

Tracing: `docker compose --profile obs up -d` and set `OTEL_EXPORTER_OTLP_ENDPOINT=http://aspire-dashboard:18890`;
traces appear at http://localhost:18888.

### Local development

```bash
npm ci
npm run lint        # eslint (incl. layer boundaries) + prettier + web lint
npm run typecheck   # tsc strict for every package and the tests
npm test            # unit tests (jest) + web tests (vitest)
npm run test:integration   # needs Docker: Testcontainers Postgres + RabbitMQ
npm run build
```

Run a service against the compose infrastructure with its env vars (see `.env.example`), for example
`DATABASE_URL=... RABBITMQ_URL=... npm run start -w @price-watch/api` after `npm run build`.

## API

| Method | Path | |
|---|---|---|
| `GET` | `/api/watches` | Watches with the latest check and 30-day low |
| `POST` | `/api/watches` | `{ "query": "AirPods Pro 2", "targetEgp": 9500 }`; requests the first check |
| `GET` | `/api/watches/{id}` | One watch |
| `PATCH` | `/api/watches/{id}` | `{ "targetEgp"?, "active"? }` |
| `DELETE` | `/api/watches/{id}` | Remove with its history |
| `POST` | `/api/watches/{id}/check` | Check now (202) |
| `GET` | `/api/watches/{id}/history?days=30` | Every check: lowest offer, healthy flag, drop reasons, shop outcomes |
| `POST` | `/internal/due-watches/claim?intervalSeconds=&limit=` | The checker's scheduler claims due watches as leases (not proxied by the web server) |
| WS | `/prices` (socket.io) | `price-dropped` events |
| `GET` | `/health/live`, `/health/ready` | Probes (api, checker, scraper) |

Errors are RFC 9457 `application/problem+json`. REST speaks EGP; inside, money is integer piastres.

## Interview talking points (design notes)

- **Why a gRPC sidecar instead of porting the scraper** (ADR 0002): reuse a tested library, scale and fail it
  independently, stream one result per shop so a deadline still yields partial data, and propagate deadlines and
  trace context in gRPC metadata. The proto is the single contract; a contract test checks decoded messages match
  the TypeScript types.
- **Scraping is unreliable by nature** (ADR 0004): per-shop time boxes, a search deadline, a sidecar-wide concurrency
  cap and a 10-minute result cache. Every shop's outcome is stored. A check is healthy only if two or more shops
  answered and at most half failed; unhealthy checks never alert and never count toward the 30-day low.
- **Exactly-once effects over at-least-once delivery** (ADR 0003): outbox in the same transaction, `checkId` unique
  for observations, alert key `(watch, Cairo day, price)` unique for alerts. A redelivered message, a duplicate check
  or a second replica can't double-alert.
- **The drop rule only fires on change**: below target *and* lower than the previous healthy check (or the first
  check); 30-day low needs three earlier healthy checks. A price that just stays low doesn't nag daily.
- **Competing consumers vs fan-out**: checks and observations use durable shared queues (scale by adding instances,
  back-pressure via prefetch); `PriceDropped` goes to an exclusive queue per API replica so every replica's
  WebSocket clients hear it.
- **Clean Architecture in Nest**: the domain has no framework imports (lint-enforced); repositories and the
  unit of work are ports, so use cases are unit-tested with in-memory adapters and the same flow runs against real
  infrastructure in the Testcontainers test.
- **One trace across three services**: OpenTelemetry instrumentations for HTTP, amqplib, gRPC, pg and Nest; the
  outbox row stores `traceparent` so a message published seconds later still joins the request's trace.
- **Schedulers that scale out**: instead of electing one scheduler, the API hands out due watches as leases in one
  statement (`FOR UPDATE SKIP LOCKED` + a `check_requested_at` stamp). Two checkers asking at the same moment get
  disjoint batches (an integration test fires two claims at once), and a lost check is retried when the lease ends.
- **Failure modes**: losing RabbitMQ exits the process (the orchestrator restarts it; durable queues and the outbox
  keep every message); a down scraper yields a failed, recorded check rather than a stuck queue.

## Status

Working: everything in the main flow above, in fake and live mode, with unit, contract and end-to-end tests.

Known gaps and next steps:

- No per-shop circuit breaker with backoff state yet; no outbox retention job.
- No authentication: it is a single-user tool for now.
- Stretch ideas: B.TECH branch stock, Telegram/email notifier consumer, shareable watch links, Azure Container Apps
  Bicep.

## Extracted from Lingo

Price Watch EG is extracted from **Lingo**, a private personal-assistant app, where price checks with a 30-day low
and wishlist target prices first lived inside one Node server. This repository is a clean re-implementation as a
small distributed system, with a fresh history and invented sample data only. The scraping itself is the separate
open-source library [`egypt-price-scraper`](https://github.com/ahmedoshelmy/egypt-price-scraper).

## License

[MIT](LICENSE)
