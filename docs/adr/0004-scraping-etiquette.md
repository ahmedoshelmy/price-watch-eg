# 4. Scraping etiquette: timeouts, limits and failure handling

Date: 2026-11-20

## Status

Accepted

## Context

Shops are third parties. They time out, block datacenter IPs, change markup, and should not be hammered.
A wrong price alert ("AirPods for 100 EGP!") is worse than a missed one.

## Decision

- **Time boxes at every level**: per shop inside the library (`SCRAPER_SHOP_TIMEOUT_MS`, default 20 s), per search
  as a gRPC deadline from the checker (`SEARCH_DEADLINE_MS`, default 45 s). Partial results are kept.
- **Bounded load**: at most `SCRAPER_MAX_CONCURRENT_SEARCHES` (2) searches in flight in the sidecar, each reading at
  most `SCRAPER_SHOP_CONCURRENCY` (4) shops at once; each checker instance runs at most `CHECKER_CONCURRENCY` (4)
  checks (RabbitMQ prefetch). Watches are re-checked every `CHECK_INTERVAL_SECONDS` (default 6 h).
- **Shared results**: a healthy search is cached for `SCRAPER_CACHE_TTL_MS` (10 min) per normalised query, so many
  watches for the same product cost one search. Results with a failed shop are never cached.
- **Failures are data**: every shop's outcome (`found`, `none`, `failed`, `blocked`) is stored with the observation.
  A check is *healthy* only if at least two shops answered and no more than half failed. Unhealthy checks are kept
  as history but can never alert and never count toward the 30-day low. Out-of-stock offers never count as the
  lowest price.
- Stay polite: no captcha solving, no proxy rotation; the library's own small retry budget applies.

## Consequences

- One shop failing, or the whole sidecar being down, never produces an alert; the history shows the gap.
- New shops or flaky periods do not cause false "30-day lows" (at least three earlier healthy checks are required).
- A per-shop circuit breaker with backoff state is future work (listed in the README).
