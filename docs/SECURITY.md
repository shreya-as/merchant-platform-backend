# Security and sensitive data

This document covers how the platform handles credentials, personal data and the audit trail, and
which fields must move to field-level encryption before production.

## Authentication and authorization

| Layer | Mechanism | Code |
|---|---|---|
| Login | `POST /auth/login` checks the password with bcrypt and issues a JWT (`sub`, `email`, `role`). If the user does not exist, the password is still compared against a dummy hash so response time doesn't reveal which emails exist. | `modules/auth/auth.service.ts` |
| Route protection | `AuthGuard('jwt')` on every non-public controller. The user is re-loaded from the DB on each request, so a deleted user's token stops working immediately. | `modules/auth/jwt.strategy.ts` |
| Role checks | `@Roles(...)` + `RolesGuard`. The role comes from the DB row, not the token claim. | `modules/auth/roles.guard.ts` |
| Object-level isolation | SALES users only see and modify applications they created. Other users' IDs return **404, not 403**, so IDs can't be probed. | `MerchantApplicationsService.assertVisible` |
| Reviewer isolation | Only the reviewer assigned to an application can record a decision on it. | `ReviewsService.decide` |
| Account creation | No self-registration; only ADMIN can create staff accounts. | `POST /auth/register` |

In production, the app refuses to start if `JWT_SECRET` is not set. There is no built-in default
secret to fall back to.

## What is never logged or stored in clear text

| Data | Rule | Where enforced |
|---|---|---|
| Passwords | Hashed with bcrypt. Login input is capped at 128 characters. The hash column is `select: false`. | `auth.service.ts`, `user.entity.ts` |
| JWTs, `Authorization` headers, API keys, secrets | Replaced with `[REDACTED]` before reaching the audit trail. Never logged. | `common/security/redact.ts` |
| SQL parameters | With `DB_LOGGING=true`, only the SQL text is logged, never the bound values (which include password hashes, emails and tax IDs). | `common/logging/parameterless-query.logger.ts` |
| Worker logs | Only job ID, application ID and the error class/message. The job payload and application data are never logged. | `risk-review.processor.ts` |
| Audit metadata | Every entry goes through `redact()`: secrets are replaced, PII is masked. Callers record field *names* for updates, and only a `hasRemarks` flag for review remarks. | `audit.service.ts` |

### Masking in API responses

| Endpoint | `tax_id` | `owner_email` | `owner_phone` |
|---|---|---|---|
| `GET /merchant-applications` (list) | `************4321` | `j***@acme.com` | `*****0100` |
| `GET /merchant-applications/:id` (detail, authorized users only) | full | full | full |

The masking helpers are `maskTail` and `maskEmail` in `common/security/redact.ts`.

## Audit trail

Table `audit_logs`. Each entry is written in the **same transaction** as the change it records, so
the trail can't show a change that never committed or miss one that did. `actor_id` is `NULL` for
system actions (the risk worker).

| Action | Recorded when | Metadata |
|---|---|---|
| `APPLICATION_CREATED` | Application created | `registrationNumber` |
| `APPLICATION_UPDATED` | Editable fields changed | `fields` (names only) |
| `APPLICATION_SUBMITTED` | DRAFT/NEEDS_INFO → SUBMITTED | `from`, `to` |
| `APPLICATION_ASSIGNED` | ADMIN assigns or reassigns a reviewer | `previousReviewerId`, `reviewerId` |
| `APPLICATION_REVIEWED` | Reviewer decides | `reviewId`, `decision`, `from`, `to`, `hasRemarks` |
| `RISK_ASSESSMENT_COMPLETED` | Worker stored a result | `score`, `result`, `providerReference`, `attempt` |
| `RISK_ASSESSMENT_FAILED` | All retries failed, or the job could not be enqueued | `attempts` + `error` class, or `reason` |
| `RISK_ASSESSMENT_REQUEUED` | ADMIN retried a failed review | none |

## Fields that need field-level encryption

TLS and disk encryption protect data in transit and at rest on the server. They do **not** protect
against a leaked DB dump or backup, or a read-only SQL user. The fields below need
application-level encryption (envelope encryption: one data key per record or tenant, wrapped by a
KMS master key such as AWS KMS or GCP KMS) before real merchant data is stored.

| Table.column | Data | Priority | Notes |
|---|---|---|---|
| `merchant_applications.tax_id` | Tax / EIN number | **Required** | Never queried by value. Encrypt with AES-256-GCM. |
| `merchant_applications.owner_email` | Personal email | **Required** | If lookup by email is ever needed, add a separate HMAC "blind index" column. |
| `merchant_applications.owner_phone` | Personal phone | **Required** | Same approach as `owner_email`. |
| `merchant_applications.owner_name` | Personal name | Recommended | |
| `merchant_applications.registration_number` | Company registry ID | Recommended | **Used by the partial unique index** `uq_open_application_per_business`. Encrypting it means moving that index to an HMAC blind-index column. Normalize the value (trim, upper-case) before hashing. |
| `application_reviews.remarks` | Free text; may contain PII | Recommended | |
| `risk_assessments.response_summary` | Provider response | Required **if** a real KYB provider returns PII | The simulated provider stores check names and flags only. |
| `users.password_hash` | bcrypt hash | No | Already one-way hashed. |

Implementation notes:

- Use a TypeORM `ValueTransformer` (like `common/transformers/numeric.transformer.ts`) so the
  encryption is transparent to services. Store ciphertext as `bytea`, or as base64 in `text`.
- Keep a `key_version` per row (or prefix it on the ciphertext) so keys can be rotated without
  decrypting everything at once.
- Masked list output (above) and audit redaction stay in place after encryption. They cover
  different risks: over-exposure through the API, and leakage into logs.
