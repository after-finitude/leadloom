# Leadloom — application with source code

**Version 1.2.0 · standalone local edition.** CRM, web chat, qualification, explainable scoring, consultation booking, and manager controls. The interface is in English.

## Start in one step

Requires **Node.js 22.16.0 or later** with the `node:sqlite` module (Node.js 24 also works). Some Node versions display an ExperimentalWarning for built-in SQLite; this warning did not prevent startup in the tested environment.

From the extracted directory:

```sh
cd leadloom
npm start
```

**No npm dependencies need to be installed: there are none.** The application uses standard Node.js modules. Open **http://localhost:3000** — use this exact address, not `127.0.0.1`, because the server validates the Origin.

| Role | Email | Local demo password |
|---|---|---|
| Administrator | `admin@leadloom.local` | `Leadloom-Demo-2026!` |
| Manager | `manager@leadloom.local` | `Leadloom-Manager-2026!` |

The first launch creates a SQLite database, the Acme Home Improvements configuration, two staff accounts, and eight synthetic leads. History, changes, and tasks persist between runs. Press Ctrl+C to stop.

Customer form: **http://localhost:3000/enquire**. To test the customer role independently, open it in another browser or a private window.

### Walk through the booking flow

Complete the form with a new fictional email address and the Roofing service. In the chat, write:

> Roofing in Demo City A. Budget $25000. I own this home and want to start in 2 months.

Click **Choose a consultation time**, then select a slot. Wait for **Your consultation is confirmed**. The CRM will show the extracted fields, a Hot rating, and the Booked stage. You can then try Take over, Pause, Resume, and the `STOP` message.

**Without external service configuration, this is a local demo:** the `mock` calendar stores events in SQLite, `mock` email appears in the Outbox, and qualification uses a deterministic demo parser. There are no paid requests or real emails by default.

## Application features

- **Conversations:** three columns, a list and filters, message history, extracted fields, scoring reasons, takeover, and pause.
- **Lead Profile:** manual field edits with locking, revision history, scores from different rule versions, notes, manager assignment, stage, and appointment cancellation/rescheduling.
- **Settings:** company, service area, services, timezone, working hours, questions, FAQ, scoring rules, and two follow-up sequences.
- **Execution Log:** accepted/rejected intake events, background actions, attempts, errors, reconciliation of unknown results, and safe retries.
- **Customer access:** a secure session, the customer's own chat, explicit selection of a server-provided slot, single-use return links, and unsubscribe.
- **Integration adapters:** OpenAI Responses API, Google Calendar through an OAuth refresh token, and Resend. They must be enabled explicitly and do not fall back to mocks when keys are missing.

## Important difference from the specification

This is **not the Next.js/NestJS/PostgreSQL/Redis implementation described in specification v1.1**. It implements an alternative runnable stack: **Node.js HTTP + browser JavaScript modules + SQLite WAL + durable tasks in SQLite**. These sources are not presented as the previously promised project that did not exist.

The standalone edition was chosen because the preparation environment could not download npm packages. Instead of unverified framework configurations, the delivery contains code that was actually run and tested. Migration to the specification's stack has not been implemented. This delivery does not claim full acceptance of AC-01–AC-26; see `DELIVERY-STATUS.md` and `docs/requirements-coverage.md`.

## Verification and commands

```sh
npm run build          # module syntax checks + deployment copy in dist/
npm test               # unit / integration / HTTP / contract tests
npm run eval -- --mock # 24 scenarios; no paid model
npm run check          # all three steps
```

`npm run build` does not simulate Next.js compilation: the source ES modules run directly in Node/the browser. The script checks each JS module and required assets, then creates `dist/`.

The delivery includes actual results for **60/60 tests** and **24/24 mock scenarios**. DOM checks of buttons and the form ran in Chromium through a bridge to the real local HTTP API. This is not native browser E2E: environment policy prohibited browser navigation to URLs. A separate `tests/browser_e2e.py` is included for a normal browser run, but no passing result is claimed. Reports and five screenshots are in `evidence/`.

Real model evaluation, which requires your key:

```sh
# First set OPENAI_API_KEY in your local .env.
npm run eval
```

Without a key, the command fails explicitly instead of switching to a mock. Calendar and email remain controlled mocks during evaluation, even with a real LLM. Reports are written to `evaluation/last-run.md` and `.json`; previous results are kept in `evaluation/history/`.

## Docker

```sh
docker compose up --build
```

Compose runs the same standalone edition with the worker enabled and a named `leadloom-data` volume. The port is published only on `127.0.0.1:3000`. The image does not download npm packages, but Docker first downloads the Node.js base image. **Docker was unavailable in the preparation environment: Dockerfile and Compose are included, but their build has not been verified here.** Direct Node startup was verified.

## Configuration and real services

Copy `.env.example` to `.env`, change the required values, and restart the server. Environment variables take precedence. The ZIP does not contain `.env`, the database, the local encryption key, or anyone else's credentials.

Details: **`docs/integrations.md`**. Do not retain demo passwords when exposing the application to a network. `APP_MODE=live` requires an HTTPS origin, your own strong passwords, a separate encryption key, and a webhook secret. The database is marked with its mode: an existing demo database cannot be switched to live; use a new `DATABASE_PATH`.

**Live adapters are implemented but have not been tested with real accounts.** Before using real leads, complete real-model evaluation, live smoke testing, a security review, and verification of the operating environment. Do not send keys in chat; configure them locally.

## Webhook intake

Endpoint: `POST /api/leads/intake`. The secret is used only by the sender:

```sh
curl http://localhost:3000/api/leads/intake \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer local-demo-webhook-change-before-use' \
  -d '{"source":"website","event_key":"demo-webhook-001","name":"Synthetic Visitor","email":"webhook@example.test","service_type":"roofing"}'
```

In demo mode, the email appears in the administrator's **Outbox**. Repeating the same source/key and payload returns the previous result; changing the payload while reusing the key causes a conflict. Identifiers and route names for this edition are documented in `docs/api.md`.

## Data, backups, and a separate worker

```sh
npm run backup
npm run seed
# Only after stopping the server and worker:
npm run demo:reset -- --confirm-stopped
```

Default database: `data/leadloom.sqlite`. A database snapshot without the encryption key cannot decrypt stored external-operation payloads or the Outbox: keep the key separate and secure. Reset is allowed only for a database marked as demo with all mock providers; do not use it on real data.

By default, the worker runs inside the server. To use a separate process, set `WORKER_ENABLED=false` for the server and run `npm run worker` with the same absolute database path and encryption key. The SQLite file must reside on a local disk on the same host. This edition does not support a network file server or a multi-region cluster.

## Repository structure

```text
src/             server, business rules, sessions, SQL schema, worker
src/providers/   mock and real OpenAI / Google Calendar / Resend adapters
web/             complete browser interface, styles, API client
scripts/         build, seed, safe demo reset, backup, live smoke
tests/           unit, integration, HTTP, provider contracts, browser harnesses
evaluation/      24 scenarios, runner, and actual mock-run results
evidence/        verification results and screenshots
docs/            architecture, API, integrations, runbook, limitations, original specification
```

Context7 was used during implementation for the `node:sqlite` API; queries and sources are recorded in `docs/context7.md`. No claims that everything is "the latest" are made without checking lockfiles/releases.
