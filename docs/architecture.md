# Standalone edition architecture

Svelte browser app → Node HTTP API → Leadloom service → SQLite. A background poller selects durable `actions` and calls provider interfaces for calendar and email operations. SQLite is the source of truth, not memory or the external calendar. A separate `worker.mjs` uses the same database; the default startup runs the worker inside the server.

## Components

`config.mjs` reads ENV and validates modes and secrets; `db.mjs` wraps SQLite with cached prepared statements, synchronous BEGIN IMMEDIATE transactions and a minimal migration runner: each numbered file in `src/migrations/` runs once, in order, and is recorded in the `migrations` table. Add schema changes as a new numbered file; never edit one that has been released.

`service.mjs` is a thin `Leadloom` facade: it builds a context (`ctx`) with the store, repositories, providers, clock and config, and exposes one interface for the HTTP API, the worker and scripts. The domain modules are functions that take `ctx`: `intake.mjs` accepts enquiries, matches contacts and opens leads; `conversation.mjs` runs the chat (AI turns, questions, handoff, opt-out, invitations); `qualification.mjs` scores leads; `crm.mjs` holds staff views and commands; `settings.mjs` publishes settings and rule versions. `operations.mjs` contains slot availability, reservations, booking, rescheduling, cancellation, and the lifecycle of external calendar and email operations: execution, confirmation, errors, reconciliation of uncertain results, and retries. `followups.mjs` schedules and sends follow-ups while checking eligibility, working hours, and touch limits. `queue.mjs` claims due actions with a lease and dispatches them. `repos.mjs` holds data access shared by several modules; queries used by one module stay in that module.

`rules.mts` calculates scores without an LLM and contains shared eligibility rules for automation, booking, and access recovery. `time.mts` iterates over UTC intervals and checks the local schedule using an IANA timezone, accounting for DST. `defaults.mts` defines typed company settings and initial scoring rules. These modules share contracts from `types.ts` and use native Node.js 24 type stripping. `auth.mjs` contains staff/visitor sessions, CSRF, and scoped access tokens. `http.mjs` declares every API route in one table with its access level (public, webhook, visitor, staff or admin) and allowed body properties; the dispatcher applies the Origin, CSRF and property checks from it. Built pages and assets are read from disk once and kept in memory.

The frontend is a Svelte 5 SPA built with Vite. `web/App.svelte` selects the existing routes; `web/pages/` contains screens, `web/components/` shared UI (each dialog is its own form in `components/modal/`), and `web/lib/workspace.svelte.ts` reactive state and navigation. Components use typed API responses and render escaped text. Each resource (lead list, profile, public chat, page data via `resource()`) has its own `AbortController`, so a newer request discards an older response; list search, filter and page change only when the new list arrives. Mutations take a named lock (`run(lock, …)`) instead of blocking the whole UI. Polling does not replace composer DOM or form drafts, and each settings tab keeps its own unsaved draft. Navigation uses real links; focus moves to the page after a route change. Colours are CSS tokens in `web/style.css`; styles owned by a single component live in that component. No SvelteKit server or additional router is needed for the existing fixed routes.

`npm run typecheck` checks backend TypeScript contracts and all Svelte/browser TypeScript. Backend `.mjs` modules are checked with `tsconfig.js.json`: strict, but unannotated parameters stay `any` and database rows are untyped. The API response types in `src/types.ts` are annotated on the functions that build those responses; `web/lib/types.ts` re-exports them. `npm run build` produces compiled, hashed browser assets in `dist/web/` and copies the Node server to `dist/src/`; CI deploys that release layout. The server still runs `.mts` with native Node 24 type stripping and needs no runtime npm installation. Frontend dependencies are bundled by Vite. HTTP/LLM input validation remains in place.

`npm run dev` runs Vite on port 5173 and the backend on port 3000 (or `PORT`). Vite proxies `/api` without changing the browser Origin. The child backend uses `APP_ORIGIN=http://localhost:5173`, preserving same-origin session/CSRF behavior. Production serves only built assets and known page routes; source components, environment files and source maps are not exposed.

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
