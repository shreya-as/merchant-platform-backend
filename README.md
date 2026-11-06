# Merchant Platform Backend

NestJS API for merchant onboarding: SALES create applications, a BullMQ worker runs an asynchronous
(simulated) KYB / risk assessment, an ADMIN assigns a REVIEWER, and the reviewer approves, rejects
or requests more information.

- Stack: NestJS 12, TypeORM + PostgreSQL, BullMQ + Redis, JWT auth.
- Requires Node.js **24.9+** (see `.nvmrc`) and pnpm.
- More detail: [docs/APPLICATION_LIFECYCLE.md](docs/APPLICATION_LIFECYCLE.md), [docs/SECURITY.md](docs/SECURITY.md).

## Secrets

No secrets are committed, and none have defaults. Every credential comes from a gitignored file or
from the shell:

| File (gitignored)            | Used by                          | Template                          |
| ---------------------------- | -------------------------------- | --------------------------------- |
| `.env` (project root)        | docker compose and e2e tests     | `.env.compose.example`            |
| `src/config/env/.env.local`  | API running on the host          | `src/config/env/.env.example`     |

- `JWT_SECRET` is required everywhere and must be at least 32 characters, or the API refuses to start.
- `DB_PASSWORD` has no default.
- Demo users get `SEED_USER_PASSWORD`. If it isn't set, `pnpm seed` generates a random password and prints it once.
- The seed refuses to run with `NODE_ENV=production` unless `ALLOW_DEMO_SEED=true`. In compose, both
  follow `SEED_ON_START`, which defaults to `false`.

## Run everything with Docker Compose

Create the root `.env` once, with random secrets:

```bash
cp .env.compose.example .env
sed -i "s|<jwt-secret>|$(openssl rand -base64 48)|; s|<db-password>|$(openssl rand -hex 16)|; s|<seed-password>|$(openssl rand -base64 12)|" .env
```

Then start the stack:

```bash
docker compose up -d --build
```

This starts Postgres, Redis and the API. On start, the API container runs the migrations. It also
seeds demo data, because the template sets `SEED_ON_START=true` for local use. Compose refuses to
start if `DB_PASSWORD` or `JWT_SECRET` is missing.

| What            | URL / port                                  |
| --------------- | ------------------------------------------- |
| API             | http://localhost:3000/api/v1                |
| Swagger UI      | http://localhost:3000/docs                  |
| OpenAPI JSON    | http://localhost:3000/docs-json             |
| Postgres (host) | `localhost:5433`, credentials from `.env`    |
| Redis (host)    | `localhost:6380`                            |

Host ports 5433 and 6380 are used so the stack does not clash with a local Postgres or Redis. You can
change them, for example `POSTGRES_HOST_PORT=5432 REDIS_HOST_PORT=6379 API_HOST_PORT=3001 docker compose up -d`.

Useful commands:

```bash
docker compose logs -f api        # follow API + worker logs
docker compose down               # stop (data is kept in named volumes)
docker compose down -v            # stop and delete all data
```

### Seeded users (local development only)

All demo users share the password set in `SEED_USER_PASSWORD` in your `.env`. Never enable
seeding in a shared or production environment.

| Email                          | Role     |
| ------------------------------ | -------- |
| admin@merchantplatform.com     | ADMIN    |
| reviewer@merchantplatform.com  | REVIEWER |
| sales@merchantplatform.com     | SALES    |

## Try the API in Swagger

1. Open http://localhost:3000/docs.
2. Run `POST /api/v1/auth/login` with one of the seeded users and copy `accessToken` from the response.
3. Click **Authorize**, paste the token, and call the other endpoints. The token is kept across page reloads.

A typical flow:

1. As SALES, call `POST /merchant-applications` and then `POST /merchant-applications/{id}/submit`.
2. Wait about a second for the risk worker. `GET /merchant-applications/{id}` now shows `UNDER_REVIEW`.
3. As ADMIN, call `POST /merchant-applications/{id}/assign` with `{ "reviewerId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22" }`.
4. As REVIEWER, call `POST /merchant-applications/{id}/reviews` with `{ "decision": "APPROVE" }`.

## Run the API on your machine (infrastructure in Docker)

```bash
nvm use                                  # Node 24
pnpm install
docker compose up -d postgres redis
```

Then create `src/config/env/.env.local` from `src/config/env/.env.example`. Point it at the compose
services (`DB_PORT=5433`, `REDIS_PORT=6380`, and `DB_USER` / `DB_PASSWORD` from your root `.env`).
Fill in `JWT_SECRET` and `SEED_USER_PASSWORD`, then run:

```bash
pnpm migration:run
pnpm seed
pnpm start:dev                           # http://localhost:3000/docs
```

The env file is chosen by `NODE_ENV`: `src/config/env/.env.${NODE_ENV:-local}`. Variables that are
already set in the shell always take precedence.

## Tests

```bash
pnpm test        # unit tests: no database or Redis needed
pnpm test:cov    # unit tests with a coverage report
pnpm test:e2e    # integration / API tests
```

### Unit tests (`src/**/*.spec.ts`)

Every module has unit tests for its business rules:

- **Merchant applications**: the state machine (every allowed and forbidden transition), ownership
  scoping, editability per status, the one-open-application-per-business rule, submit/enqueue
  ordering, the enqueue-failure fallback, requeue, reviewer assignment, PII masking, and DTO validation.
- **Auth**: login and register, no user enumeration, `RolesGuard`, `JwtStrategy` (roles are loaded
  from the database, not taken from the token), and route guard/role metadata.
- **Reviews**: decisions and their resulting statuses, only the assigned reviewer may decide, no
  decision before the risk review completes, no double decisions, and remarks are kept out of the audit log.
- **Risk**: the processor (idempotency, stale jobs, retries, final failure), the simulated provider
  (deterministic and threshold-based), and queue job ids.
- **Audit and common**: redaction of secrets and PII, and the numeric transformer.

### Integration / API tests (`test/*.e2e-spec.ts`)

These boot the real `AppModule` against Postgres and Redis (with the BullMQ worker running in-process)
and call it over HTTP with supertest. They need the compose infrastructure:

```bash
docker compose up -d postgres redis
pnpm test:e2e
```

The tests use `src/config/env/.env.test`, which holds no secrets: database `merchant_platform_test`
and Redis DB 1, so dev data is never touched. `DB_USER`, `DB_PASSWORD`, `JWT_SECRET` and
`SEED_USER_PASSWORD` are read from the shell or from the root `.env`. A global setup creates the database if it is missing, rebuilds the schema
from the migrations, seeds the users, and flushes the test Redis DB. As a safeguard, it refuses to run
unless `NODE_ENV=test` and the database name ends in `_test`.

| File                                | Covers                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth.e2e-spec.ts`                  | Login, uniform 401s, expired, garbage and non-Bearer tokens, `/auth/me`, ADMIN-only registration                                                       |
| `application-lifecycle.e2e-spec.ts` | Full DRAFT → … → APPROVED flow including NEEDS_INFO and resubmission, the audit trail, REJECTED as a terminal state, invalid transitions, pagination and masking |
| `risk-processing.e2e-spec.ts`       | Async assessment, idempotent redelivery, stale jobs, transient retry with backoff, FAILED after the last retry plus ADMIN requeue, decisions blocked while risk is in progress |
| `authorization.e2e-spec.ts`         | 401 on every route; forged-secret, `alg: none` and deleted-user tokens; tampered role claims; spoofed headers; role matrix; cross-user (object-level) access; mass assignment |
| `app.e2e-spec.ts`                   | API prefix and the Swagger / OpenAPI document                                                                                                           |

## Database migrations

```bash
pnpm migration:generate src/database/migrations/<Name>
pnpm migration:run
pnpm migration:revert
```
## AI Assistance & Disclosure

AI coding assistants (Claude) were used during development for:

- Troubleshooting implementation issues.
- Code review and refactoring suggestions.
- Identifying potential edge cases and improving code quality.

**Verification:**

- Reviewed AI-generated suggestions before implementation.
- Manually verified the implemented functionality.
- Tested API endpoints and database operations.
- Reviewed the final implementation for correctness, maintainability, and consistency with project requirements.
