# 1. Record architecture decisions, and why NestJS

Date: 2026-11-20

## Status

Accepted

## Context

Price Watch EG is a small distributed system (an API, a worker, a scraper sidecar, a web app) built to be read by
other people. Decisions that are obvious while building are invisible to a reader months later.

The scraper it wraps, [`egypt-price-scraper`](https://github.com/ahmedoshelmy/egypt-price-scraper), is TypeScript.
The sibling apps extracted from the same personal app (Qirsh, Job Radar) are .NET with Clean Architecture.

## Decision

- Keep lightweight ADRs (this format) in `docs/adr/`, one per decision that is costly to reverse.
- Build every service in **NestJS on Node 22, TypeScript strict**:
  - Same language as the scraper library, so the sidecar wraps it in-process instead of shelling out or porting it.
  - Nest modules, providers and decorators map one-to-one onto the ASP.NET Core ideas used in the sibling repos
    (DI container, controllers, hosted services, `IOptions`-style validated config), so the Clean Architecture layout
    is the same: `domain/` (pure TypeScript), `application/` (use cases + ports), `infrastructure/` (TypeORM,
    RabbitMQ, gRPC adapters), `presentation/` (controllers, gateways, consumers).
  - One toolchain (npm workspaces, one lockfile, one lint config) for four deployables.
- Enforce the dependency rule with `eslint-plugin-boundaries` plus `no-restricted-imports` in `domain/` (no Nest,
  TypeORM, amqplib, gRPC or socket.io imports). `npm run lint` fails on a violation.

## Consequences

- The domain and the drop rule are unit-tested without Nest, a database or a broker.
- Application services use Nest's `@Injectable`/`@Inject` for wiring; that is the one framework touch allowed
  outside infrastructure, accepted to avoid a second DI mechanism.
- Nest DI reads constructor parameter types at runtime (`emitDecoratorMetadata`), so the lint config deliberately
  does not force `import type` for injected classes.
