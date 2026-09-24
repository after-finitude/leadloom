# Refactoring plan

Analysis date: 2026-09-24. The analysis was done by reading the code; tests, lint and the build were not run during the analysis.

## Summary

There are no serious architectural mistakes. The backend has solid foundations: idempotent operations, leases for jobs, revision checks, payload encryption and 79 integration tests. There are two main problems: all the logic lives in a 1,400-line `Leadloom` class, and SQL access is spread across every layer. On the frontend, the data-loading layer lets one deleted lead break the whole page, and several components each do several jobs.

## Bugs (fix before refactoring)

| #   | Where                                                          | Problem                                                                                                                                                                                                                                                                                                                                                                                                            |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [db.mjs:39](../src/db.mjs#L39) and about 10 `audit()` calls    | `audit()` defaults to `now = Date.now()`. Some calls (`booking_requested`, `*_started`, `action_retry`, `note_added`, `action_failed`, `intake_resolved`, `reconciliation_unresolved`) do not pass `clock()`. In tests and with an injected clock, audit events get time from two different sources and their order breaks. The same applies to `Store.limit()`, called from [http.mjs:202](../src/http.mjs#L202). |
| 2   | [operations.mjs:239-246](../src/operations.mjs#L239)           | Rescheduling checks booking eligibility with its own code instead of `mayBook`, so required questions and email are not checked. If this is intentional, it needs a separate function in `rules.mts`.                                                                                                                                                                                                              |
| 3   | [workspace.svelte.ts:120](../web/lib/workspace.svelte.ts#L120) | The lead profile is loaded in the same `try` as the list. If the `?lead=` lead does not exist (404), the page shows "Unable to open this page" instead of the inbox, and polling shows "Reconnecting…" forever.                                                                                                                                                                                                    |
| 4   | [workspace.svelte.ts:247](../web/lib/workspace.svelte.ts#L247) | Polling treats 401 as a network error, so an expired session never redirects to `/login`.                                                                                                                                                                                                                                                                                                                          |
| 5   | [Settings.svelte:36-71](../web/pages/Settings.svelte#L36)      | `draft()` has no branch for the scoring tab: unsaved weights are lost when switching tabs. Saving any tab also sends unsaved drafts from the other tabs.                                                                                                                                                                                                                                                           |
| 6   | [Login.svelte:67](../web/pages/Login.svelte#L67)               | `'Acme Home Improvements'` is hard-coded. `/api/meta` returns `company`, but the `Meta` type omits it, so renaming the company in Settings does not change the enquiry page.                                                                                                                                                                                                                                       |

## Weaknesses

### Backend: structure

- **[service.mjs](../src/service.mjs) is a 1,400-line god class.** It mixes intake, the LLM conversation, CRM commands, scoring, the queue, the worker (`tick`) and UI queries. `intake()` is about 220 lines, `turn()` about 175, and `control()` is an `if/else` chain of eight commands.
- **Two-way coupling.** [operations.mjs](../src/operations.mjs) and [followups.mjs](../src/followups.mjs) receive the whole `app` and call its methods. `Leadloom` itself has about 15 pass-through methods like `book() { return operations.book(this, …) }`. In practice, the modules are not separated.
- **Hidden side effects.** `score()` does not only calculate the score; it also queues a follow-up through `beginWait` ([service.mjs:267](../src/service.mjs#L267)). It is called from intake, turn, editFields and control.
- **Domain constants are scattered.** `'Won','Lost'`, `'Hot','Warm'` and `'Proposal','Won','Lost'` repeat about 15 times in SQL and JS. The stage list is defined in three places: the service, `src/types.ts` and `web/components/Modal.svelte`.
- **The `.mjs` backend is not type-checked** (`checkJs: false` in [tsconfig.json](../tsconfig.json)). Only `rules`, `time` and `defaults` are typed, and the types in [web/lib/types.ts](../web/lib/types.ts) are not checked against anything.

### Backend: data and SQL

- **[architecture.md](architecture.md) says SQL lives in `db.mjs`, but it does not.** Raw SQL appears in service, operations, followups, auth and even [http.mjs](../src/http.mjs#L285) (users, contacts, rules, appointments). `prepare()` runs on every query without a cache.
- **N+1 and redundant queries.**
  - `list()` calls `lead()` and a separate `last_message` query for every row: up to 200 queries per page.
  - `bump()` does `lead → save → lead`.
  - `score()` calls `lead()` three times and `rules()` three times.
  - `profile()` calls the whole `publicState()` just for the messages.
  - `summary()` calls `rules()` twice.
- **No `lead_id` indexes** on `audit_events`, `field_revisions`, `score_evaluations`, `notes`, `handoffs`, `slot_offers`, `operations`, `actions`. `profile()` and `cancelPending` scan whole tables.
- **No cleanup.** Nothing deletes expired `sessions`, `access_tokens`, `rate_limits` or `slot_offers`. Every `availability` request inserts N slot offers.
- **No migrations.** The `migrations` table is written but never read. `runtime_locks` is unused. `app_metadata` is created after version 1 is recorded. With a `CREATE IF NOT EXISTS` schema, existing databases will not pick up the next column change.
- **`reserve()` loads every active reservation** and checks overlaps in JS instead of with a range query.

### HTTP layer

- **[http.mjs](../src/http.mjs) is one 300-line handler** with routing through an `if` and regex chain. The SPA route list duplicates the frontend.
- **The `providers` block is repeated three times.** Version `'1.2.0'` is hard-coded in `package.json`, `main.mjs` and `http.mjs`.
- **`readFileSync` on every request** for `index.html` and assets.
- **Every public request opens a write transaction** (`BEGIN IMMEDIATE`) for rate limiting and competes with the worker for the SQLite lock.
- **500 errors are logged without a stack:** only the class name is logged. This protects privacy but makes debugging much harder.

### Frontend

- **One `generation` counter guards three independent resources** in [workspace.svelte.ts](../web/lib/workspace.svelte.ts) (list, profile, public chat): loading one discards responses for the others. `search()` increments the counter without owning a request.
- **`ui.page` and `ui.filter` change before the request** ([Pagination.svelte](../web/components/Pagination.svelte), [LeadTools.svelte](../web/components/LeadTools.svelte)), and the URL is written before the fetch. Nothing is rolled back on error.
- **The global `ui.busy` lock silently drops clicks**, because lead cards and filters are not disabled while it is set.
- **Components do several jobs.**
  - [Modal.svelte](../web/components/Modal.svelte) handles 9 dialogs in one `if` chain. The field-diff and type-conversion logic is inline and untested.
  - [PublicChat.svelte](../web/pages/PublicChat.svelte) combines unsubscribe, access, booking and the composer; [Login.svelte](../web/pages/Login.svelte) combines staff sign-in and the enquiry form.
- **Duplication.**
  - Message composer: `Conversation.svelte` and `PublicChat.svelte`.
  - Owner label: `Inbox.svelte` and `Conversation.svelte`.
  - Appointment card: `Inbox.svelte` and `PublicChat.svelte`.
  - The "load on mount" pattern three times: `Settings`, `Activity`, `Outbox`.
- **[api.ts](../web/lib/api.ts#L51):** a non-JSON response (for example, a 502 from a proxy) becomes a `SyntaxError` in the toast. "Offline" cannot be told apart from "server error". Messages for error codes live both in `ApiError` and in `Login.svelte`.
- **[style.css](../web/style.css) has 2,000 lines of global styles.** 57 lines use hex colors instead of the tokens. Dead selectors: `.gap8`, `.truncate`, `.connection-warning`, `.avatar.lg`. Also unused: `ui.stats`, the `count` prop of `Heading`, the `compact` prop of `LeadControls` and the `clock`, `play` and `chevron` icons.
- **Polling every 3 seconds** reloads the list and the whole lead profile (messages, timeline, revisions). `boot()` calls `/me` on every navigation.
- **Accessibility.** Navigation uses `<button>` with no `<nav>` and no real links. Tabs use `aria-pressed` instead of tab roles. Working days in Settings have no `fieldset/legend`. Focus is not moved after a route change.
- **Frontend logic is barely tested:** [frontend-state.test.mjs](../tests/frontend-state.test.mjs) covers only drafts, list URLs and message grouping.
- **Minor:** before the first message, `PublicChat.svelte` uses `visitor:${chat.csrf}` as the draft key, so the CSRF token ends up in a sessionStorage key name.

### Repository and infrastructure

- `npm run check` runs `eval -- --mock`, which overwrites `evaluation/last-run.*` (possibly a real-LLM report) and adds files to `evaluation/history/`; `npm run build` rewrites `evidence/build.json`. The evaluation report is a deliberate, spec-required artifact (see `docs/status.md`), so the files should stay tracked, but routine checks should not dirty them.
- Deployment runs as `root@` ([deploy.yml](../.github/workflows/deploy.yml)).

## Plan

The order keeps each step small, behaviour-preserving and covered by the existing tests (`npm test` and `npm run eval -- --mock`).

| Phase | What                      | Estimate | Check                                   |
| ----- | ------------------------- | -------- | --------------------------------------- |
| 0     | Bugs and artifacts in git | 0.5 day  | A test per bug                          |
| 1     | Domain constants and time | 0.5 day  | `npm test`                              |
| 2     | Data layer                | 1–2 days | Tests, `EXPLAIN QUERY PLAN`             |
| 3     | Split `Leadloom`          | 2–3 days | Tests and `eval --mock` unchanged       |
| 4     | HTTP                      | 1 day    | `tests/http.test.mjs`                   |
| 5     | Backend types             | 1 day    | `npm run typecheck`                     |
| 6     | Frontend                  | 2–3 days | `npm run check`, `tests/browser_e2e.py` |
| 7     | Infrastructure            | optional | —                                       |

If time is short: phase 0 → phase 6, items 18–19 (user-visible bugs) → phase 2, items 6–7 (performance) → phase 3 (maintainability).

### Phase 0. Safety net

1. Fix bugs 1–6. Write a test that reproduces each one. Check: the new tests fail before the fix and pass after it.
2. Keep the evaluation report tracked, but stop routine checks from rewriting it: for example, let `npm run check` run the mock evaluation without saving, and save only on an explicit `npm run eval`. Decide the same for `evidence/build.json`. Check: `git status` is clean after `npm run check`.

### Phase 1. Domain constants and time

3. Create `src/domain.mts` with `STAGES`, `CLOSED_STAGES`, `ACTIVE_CATEGORIES` and `LIST_FILTERS` arrays and types derived from them (`as const`). Replace the literals in service, operations, followups and rules, and on the frontend in `Modal` and `LeadTools`.
4. Remove the `Date.now()` defaults from `Store.audit` and `Store.limit`: make the clock a required parameter or pass `clock` into `Store`. Check: grep finds no `Date.now` in `src/` except `config` and `main`; tests pass.

### Phase 2. Data layer

5. Add repositories on top of `Store`: `leads`, `contacts`, `messages`, `actions`, `operations`, `appointments`, `audit`. Move all SQL into them, including the SQL in `http.mjs`. Cache `prepare()` by query text.
6. Remove N+1 queries:
   - Rewrite `list()` as one query with a subquery for `last_message`.
   - `bump()` should return the updated row without calling `lead()` again.
   - Call `rules()` once in `score()` and `summary()`.
   - `profile()` should not call `publicState()`.
7. Add indexes on `lead_id` and `(lead_id, kind, state)`.
8. Add minimal migrations: numbered SQL files plus reading the `migrations` table. Remove `runtime_locks`.
9. Add periodic cleanup of expired `sessions`, `access_tokens`, `slot_offers` and `rate_limits` in `tick()`.

Check: tests pass; `EXPLAIN QUERY PLAN` for the `profile` and `list` queries uses the indexes.

### Phase 3. Split `Leadloom`

10. Extract modules with explicit dependencies `{ repos, providers, clock, config }` instead of `app`:
    - `intake.mjs`: `intake`, `resolveIntake`, `requestAccess`.
    - `conversation.mjs`: `postMessage`, `turn`, `askNext`, `handoff`, `manualMessage`.
    - `qualification.mjs`: `score` as a pure calculation plus persistence; whoever calls score calls `beginWait` explicitly.
    - `crm.mjs`: `control` as a command table `{ takeover, pause, … }`, `editFields`, `addNote`.
    - `worker.mjs`: `tick`, lease recovery, a `kind → handler` dispatcher.
    - `operations.mjs` and `followups.mjs` take their dependencies explicitly.
11. Keep `Leadloom` as a thin facade for HTTP and tests so the tests change as little as possible.
12. Split `intake()` and `turn()` into steps: validate → match contact → resolve lead → start dialog; extract → apply updates → decide next step.

Check: `npm test` and `npm run eval -- --mock` pass with no test changes other than imports.

### Phase 4. HTTP

13. Add a route table `[method, pattern, { auth: 'public' | 'visitor' | 'staff' | 'admin', keys, handler }]`. Derive the CSRF, Origin and `allowKeys` checks from it declaratively.
14. Cache `index.html` and assets in memory at startup. Read the version from `package.json`. Extract a single `providersInfo()` function.
15. Log the stack for 500 errors, without the request body.

Check: `tests/http.test.mjs` passes.

### Phase 5. Backend types (can run in parallel with phase 3)

16. Enable `checkJs` for `src/` (starting with `// @ts-check` in the new modules), or convert modules to `.mts` as they are split out.
17. Define API response types in `src/types.ts` and import them in `web/lib/types.ts` instead of duplicating them by hand.

Check: `npm run typecheck`.

### Phase 6. Frontend

18. Rewrite `workspace.svelte.ts`:
    - One `AbortController` per resource.
    - `loadLeads(params)` writes to `ui` only on success.
    - The profile loads separately; on 404 it clears `leadId`.
    - Shared 401 handling.
    - Per-action locking instead of a global `busy`.
19. In `api.ts`, guard JSON parsing, use `ApiError(status: 0)` for network errors, and keep the error-code-to-message mapping in one module.
20. Split `Modal` into a `ModalShell` and one form per dialog kind. Move `diffLeadFields()` into `lib/`. Add `Composer`, `OwnerLabel` and `AppointmentCard` components and a `resource()` helper for `Settings`, `Activity` and `Outbox`. Split `PublicChat` and `Login` by screen.
21. Settings: separate state per tab with an unsaved-changes flag. Make Scoring its own form.
22. Switch navigation to `<a href>` + `<nav>` (updating `tests/browser_e2e.py`), tabs to proper ARIA roles, and move focus after a route change.
23. CSS: delete dead rules, replace hex colors with tokens, move component-specific styles into component `<style>` blocks.
24. Tests for pure logic: `diffLeadFields`, `api.ts`, list-state, request races in the store. Store tests may need vitest with the Svelte plugin (not verified).

Check: `npm run check` and `tests/browser_e2e.py`.

### Phase 7. Infrastructure (optional)

25. Deploy as a dedicated user instead of `root`.
26. Move public rate limiting into process memory, or run it without `BEGIN IMMEDIATE` if the threat model allows.
