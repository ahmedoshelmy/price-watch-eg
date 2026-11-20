# 2. Wrap the scraper in a gRPC sidecar instead of porting it

Date: 2026-11-20

## Status

Accepted

## Context

Searching ~20 Egyptian shops is the hard, fragile part of this product. It already exists as a tested,
MIT-licensed TypeScript library, `egypt-price-scraper`, with per-shop readers, Pricena fallback and
accessory filtering. The checker needs to call it with a time limit, see which shops failed, and never be
blocked by one slow shop. Scraping is CPU- and network-heavy and has different scaling needs from the checker.

Options:

1. Import the library into the checker directly.
2. Port the readers into the checker.
3. Run it as a separate service behind a contract (REST or gRPC).

## Decision

Option 3 with **gRPC**: `libs/contracts/proto/scraper.proto` defines `Scraper.Search(query, shops) -> stream ShopResult`
and `Health`. The `apps/scraper` NestJS microservice implements it; the checker's `GrpcScraperClient` is the only
caller. The sidecar image clones the public library at a pinned commit (`1ed6b07`) and builds it, since it is
not published to npm. `SCRAPER_MODE=fake` (the default) serves a deterministic catalog for CI, tests and demos.

Why gRPC over REST:

- **Server streaming**: one `ShopResult` per shop as soon as it answers, so a deadline still yields partial results.
- **Deadlines propagate**: the checker's deadline travels in the `grpc-timeout` header; both sides agree when to stop.
- **Typed contract**: one `.proto` file; a contract test checks the decoded messages match the TypeScript types.
- **Trace context in metadata**: OpenTelemetry's gRPC instrumentation carries W3C `traceparent`, so one trace spans
  api -> RabbitMQ -> checker -> scraper.

## Consequences

- The scraper scales and fails independently (its own memory limit, restart policy, rate limits).
- Fake mode keeps every test hermetic: no test touches a real shop.
- Contract changes must be additive (never renumber fields); both sides load the same file at runtime via
  `@grpc/proto-loader`, so there is no generated code to drift.
- One more network hop and container; acceptable at a few checks per minute.
