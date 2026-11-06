# Merchant application lifecycle

## States

```
DRAFT ──submit──▶ SUBMITTED ──risk review done──▶ UNDER_REVIEW ──APPROVE──▶ APPROVED
                     ▲                                  │ ──REJECT───▶ REJECTED
NEEDS_INFO ──submit──┘ ◀───────REQUEST_INFO─────────────┘
```

All allowed transitions are listed in one place:
`src/modules/merchant-applications/application-state-machine.ts`. Any other transition returns
**409 Conflict**.

`risk_status` is tracked separately: `PENDING → PROCESSING → COMPLETED`, or `FAILED` once retries
run out. A resubmission resets it to `PENDING`.

## Endpoints

All routes are under `/api/v1` and need a Bearer token (except login).

| Method & path | Roles | Notes |
|---|---|---|
| `POST /auth/login` | public | Returns `{ accessToken, user }` |
| `POST /auth/register` | ADMIN | Creates a staff account |
| `GET /auth/me` | any | |
| `POST /merchant-applications` | ADMIN, SALES | Creates a DRAFT. Only one open application per `registrationNumber`. |
| `GET /merchant-applications?status=&page=&limit=` | any | SALES see only their own. Tax ID and owner contact details are masked. `limit` ≤ 100. Returns `{ data, meta }`. |
| `GET /merchant-applications/:id` | any | Includes `risk_assessments` and `reviews`. Returns 404 for another SALES user's application. |
| `PATCH /merchant-applications/:id` | creator or ADMIN | Only while DRAFT or NEEDS_INFO |
| `POST /merchant-applications/:id/submit` | creator or ADMIN | Moves to SUBMITTED and enqueues the risk review |
| `POST /merchant-applications/:id/assign` `{ reviewerId }` | ADMIN | Only while SUBMITTED or UNDER_REVIEW. The target user must have the REVIEWER role. |
| `POST /merchant-applications/:id/risk-review/retry` | ADMIN | Only when SUBMITTED and risk is FAILED |
| `POST /merchant-applications/:id/reviews` `{ decision, remarks? }` | REVIEWER (the assigned one) | Only once risk is COMPLETED and the application is UNDER_REVIEW. `remarks` is required for REJECT and REQUEST_INFO. |

## Asynchronous risk review (BullMQ)

```
submit (tx commits) ──▶ queue.add(jobId = idempotency key)
                              │
                         worker picks up the job
                              │
          already assessed? / stale submission? ──yes──▶ skip
                              │ no
          risk_status = PROCESSING
          call the provider (outside any transaction or lock)
                              │  throws ──▶ BullMQ retries: attempts = BULLMQ_RETRY_ATTEMPTS,
                              │             exponential backoff from BULLMQ_BACKOFF_DELAY_MS
                              │             last attempt fails ──▶ risk_status = FAILED + audit entry
          one transaction, application row locked:
            re-check idempotency, insert risk_assessment,
            SUBMITTED → UNDER_REVIEW, risk_status = COMPLETED, audit entry
```

**Idempotency key:** `risk-<applicationId>-<submitted_at ms>`, one per submission. It is used:

1. as the BullMQ `jobId`, so enqueuing the same submission twice is a no-op;
2. in a check before calling the provider, so a duplicate delivery skips the paid call;
3. in a check under the row lock before writing, so two concurrent workers can't both write;
4. as the `UNIQUE` column `risk_assessments.idempotency_key`, the final guarantee. A unique
   violation is treated as "duplicate", not as an error.

The simulated provider derives its score from the key, so retries of the same submission get the
same answer, the way a real provider behaves when it honours an idempotency key.

**If Redis is down at submit time:** the submission still commits, `risk_status` is set to `FAILED`
and an audit entry is written. An ADMIN can then call `/risk-review/retry` to requeue it.

The worker currently runs in the API process (`RiskModule`). To scale it separately, start
`RiskReviewProcessor` from its own entrypoint.

### Configuration

| Env var | Default | Purpose |
|---|---|---|
| `BULLMQ_RETRY_ATTEMPTS` | 3 | Attempts per job |
| `BULLMQ_BACKOFF_DELAY_MS` | 2000 | Base delay for exponential backoff |
| `RISK_PASS_THRESHOLD` | 70 | Score at or above this gives `PASS`; below gives `MANUAL_REVIEW` |
| `RISK_SIMULATED_LATENCY_MS` | 800 | Simulated provider latency |
| `RISK_TRANSIENT_FAILURE_RATE` | 0 | Share of provider calls (0 to 1) that fail. Set e.g. `0.5` to watch retries happen. |
