# Specification v1.1 coverage and local edition boundaries

This is not a full acceptance certificate. "Local" means execution on the alternative Node/SQLite stack with mock providers. Live verification and the original specification's infrastructure are absent.

| AC | Implementation / evidence | Boundary |
|---|---|---|
| 01 | Idempotent intake, changed-payload conflict; domain/HTTP tests | Contact + Lead + Conversation; Opportunity is physically merged with Lead |
| 02 | Rejected intake, identifier conflicts, both active-Lead policies, manual resolution | Phone normalization accepts only explicit international format; it does not guess a country |
| 03 | Form, own chat, webhook invitation, phone-only handoff, first-contact measurement | Local timings were tested; real email SLA was not measured |
| 04 | One question, multiple fields, no repeated questions; mock evaluation | The real model was not evaluated; the mock understands a limited set of English phrases |
| 05 | Null, optional skip, initial question + at most two clarifications, required-field handoff | The listed scenarios were tested, not arbitrary free-form wording |
| 06 | Field history, corrections, manual locks, and conflicting proposals | Local UI/business logic |
| 07 | Score factors, versions, independent states, explicit recalculation | Demo weights and a general budget reference, not a market estimate |
| 08 | Hard reject for service/area; no automatic nurture for Nurture/Unqualified | Local negative tests |
| 09 | Handoff context for human requests, negative responses, questions outside the FAQ, banned topics, and LLM failures | Live LLM recall/precision was not measured |
| 10 | Revisions, Take over during generation, separate Pause/Resume/Return/Consent | Process and persisted-state concurrency were tested; no distributed deployment |
| 11 | Contact-wide STOP, cancellation of pending actions, no implicit consent | An external provider request that has already started cannot be guaranteed to be revoked |
| 12 | IANA timezone, DST, schedule, buffer, slot offers | A real freeBusy adapter is implemented; live Google was not called |
| 13 | Explicit selection, email/qualification gate, confirmed mock event, Booked/summary | No real Google event was created |
| 14 | Reservation, stale offers, idempotency, lost-response unknown/reconcile | Local / contract tests; an external Google editor is not atomic with the database |
| 15 | Cancellation/rescheduling of one appointment, preserving the old state on failure | Tested with mocks and adapter contracts, without real Google |
| 16 | Two queues with three touches each, per-Lead counter, one active sequence | The email template is shared across the three touches, not independently editable per step |
| 17 | State and working-hours checks, reply cancellation, and skipped backlog | SQLite durable scheduler instead of Redis/BullMQ |
| 18 | Hashed scoped tokens, single-use POST exchange, expiry, separate unsubscribe | API security was tested; native-loading browser E2E is still required |
| 19 | SQLite store reopen, claims/leases, and stable action/operation keys | PostgreSQL/Redis are not used; a local disk is required |
| 20 | LLM repair + handoff, unknown calendar/email results, database errors do not become success | No real provider failures were injected; tests use controlled faults |
| 21 | Conversations / profile / notes / stage / fields / meeting / takeover | DOM smoke through an actual HTTP bridge; native browser routing was not tested |
| 22 | Settings, rule versions, attempt log, safe retry / reconcile | All settings are consolidated into compact endpoints |
| 23 | RBAC, public schemas, CSRF/Origin, escaping, hashed sessions, encrypted payloads, audit triggers | SQLite triggers are not the PostgreSQL permission model; no independent security review |
| 24 | 24 scenarios, commands, and actual mock reports | The real model was not run; not all §13 metrics are implemented in full analytical form |
| 25 | Live smoke script and real adapters are included | NOT PASSED: no real keys/accounts/evidence of delivery or a Google event |
| 26 | Code, schema, seed, ENV examples, instructions, screenshots, Dockerfile/Compose | INCOMPLETE: Docker was not run; no public deployment or video |

## Additional limitations

- Vanilla JS/CSS instead of Next.js/TypeScript/Tailwind; Node HTTP instead of NestJS; SQLite instead of PostgreSQL; a database poller instead of BullMQ/Redis. This is a deliberately separate local edition, not an undisclosed substitution in the specification.
- UI updates arrive through polling approximately every 1.8 seconds, not WebSocket/SSE.
- After updating services/hours/duration, the administrator must align FAQ and question text: old FAQ text is not rewritten automatically. The question count/text settings are not a general-purpose schema builder.
- Email is used for invitations/follow-up, not as an inbound conversation channel. A phone preference triggers handoff; SMS and calls are not supported.
- Incoming phone numbers are accepted only in international notation; invalid numbers are not corrected using an external directory.
- There is no registration/password-reset/staff-management UI. Two initial accounts are created when the database is empty; subsequent ENV password changes do not alter an already stored hash. For live mode, use a new database with the required credentials.
- There is no automatic schema-upgrade mechanism for future incompatible versions. Before upgrading, create a backup and perform the required migration.
- Stopping automation does not delete an existing appointment. Old email sequences are not automatically restored after appointment cancellation.
- Local runtime does not equal production readiness. Real data requires live acceptance, infrastructure, a backup/restore test, and a security review.
