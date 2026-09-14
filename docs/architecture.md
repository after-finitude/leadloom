# Standalone edition architecture

Browser → Node HTTP API → Leadloom service → SQLite. A background poller selects durable `actions` and calls provider interfaces for calendar and email operations. SQLite is the source of truth, not memory or the external calendar. A separate `worker.mjs` uses the same database; the default startup runs the worker inside the server.

## Components

`config.mjs` reads ENV and validates modes and secrets; `db.mjs` contains prepared SQL statements and synchronous BEGIN IMMEDIATE transactions; `schema.sql` creates the schema idempotently. There is no versioned migration framework: this is the initial schema for this version.

`service.mjs` manages intake, CRM, conversations, revisions, and the action queue. Its methods preserve a single `Leadloom` interface for the HTTP API and worker. `operations.mjs` contains slot availability, reservations, booking, rescheduling, cancellation, and the lifecycle of external calendar and email operations: execution, confirmation, errors, reconciliation of uncertain results, and retries. `followups.mjs` schedules and sends follow-ups while checking eligibility, working hours, and touch limits. Both modules receive the service instance as an argument and use its store, providers, and clock.

`rules.mts` calculates scores without an LLM and contains shared eligibility rules for automation, booking, and access recovery. `time.mts` iterates over UTC intervals and checks the local schedule using an IANA timezone, accounting for DST. `defaults.mts` defines typed company settings and initial scoring rules. These modules share contracts from `types.ts` and use native Node.js 24 type stripping. `auth.mjs` contains staff/visitor sessions, CSRF, and scoped access tokens. `http.mjs` separates public and staff routes.

TypeScript migration is partial. `npm run typecheck` checks the migrated modules under strict mode and compile-only negative examples in `tests/type-contracts.ts`. Existing JavaScript imports are allowed but not checked; the browser still receives `.js`. The runtime does not run the TypeScript checker: `npm run build` checks types before copying the source into `dist/`, and CI runs this build through `npm run check`. No emitted JavaScript, runtime TypeScript dependency or server-side npm install is required. Runtime input validation remains in place.

## State boundaries

`contacts.opt_out` applies to all enquiries from a contact; `leads.owner`, `paused`, `review_reason`, `qualification`, `stage`, and `category` are independent. Conversation has a one-to-one relationship with Lead. Opportunity is not a separate SQL table in this edition: the stage and assigned manager are stored on Lead. This is an explicitly simplified physical model, not a verbatim implementation of the specification's DDL.

Each message and control change increments the revision. Generation runs outside the write transaction. Before saving a reply, the revision and permissions are checked again; a stale draft is not published. Manual fields are locked, and conflicting updates are saved as proposals for the manager.

## Durable actions

Intake and enqueue are committed transactionally. The external payload is encrypted with AES-256-GCM, and the operation key is persisted. The worker claims a due action with a lease. External requests do not run inside SQLite write transactions. Redelivery of an action does not imply a repeated business effect: the external result and operation key have separate state.

After an uncertain response, the action becomes unknown. A retry does not assume that the email/event was never created. Google uses a precomputed valid event.id; email uses a stable payload and idempotency key with a limited safe replay window. If the result cannot be reconciled reliably, a human must intervene.

Booking first creates a local reservation for the entire time interval. Immediately before calling the calendar API, eligibility and availability are checked again. This protects against concurrent operations within the application, but does not provide a shared transaction with an independent Google Calendar editor.

## Security and limitations

SQL parameters are bound, user strings are HTML-escaped, and the API has a separate public schema. Staff passwords are hashed with scrypt. Sessions and access tokens are stored as hashes. Browser writes require CSRF and an exact Origin match. The trusted source webhook is protected by a Bearer secret; the public form has its source set by the server.

SQLite triggers prohibit audit UPDATE/DELETE through ordinary application queries. This is **not** equivalent to a restricted PostgreSQL role: the file owner can modify the schema. Deleting the demo database through the service command explicitly resets the entire synthetic database.

This edition is best suited to local demonstrations, a single operating host, and low traffic. SQLite is synchronous: expensive SQL queries can block the event loop. There is no distributed cluster SLA, standby host, or NFS support. Real operation requires an architecture and load testing appropriate to the requirements.
