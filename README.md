# Leadloom

**1.2.0 · standalone edition.** Incoming enquiry → private chat → qualification and explainable scoring → consultation booking → staff follow-through. Built with Node.js HTTP, browser JavaScript and SQLite; no runtime npm dependencies.

## Run locally

Requires Node.js **22.16.0+** with `node:sqlite` (Node.js 24 also works).

```sh
npm start
```

Open [localhost:3000](http://localhost:3000); customer form: [/enquire](http://localhost:3000/enquire). Use the exact configured `APP_ORIGIN`, including hostname and port. No `npm install` is needed. The default first launch creates a local database, staff accounts and eight synthetic leads.

| Default local account | Email | Password |
| --- | --- | --- |
| Administrator | admin@leadloom.local | Leadloom-Demo-2026! |
| Manager | manager@leadloom.local | Leadloom-Manager-2026! |

These credentials apply only to a fresh default local demo. The shared VPS uses generated credentials. Changing ENV passwords does not change accounts already stored in the database.

Providers default to mocks: qualification uses a limited deterministic parser, calendar events stay in SQLite, and emails appear in the administrator's Outbox. Real adapters require explicit configuration.

## Documentation

| Document | Read it for |
| --- | --- |
| [Product flow](docs/product-flow.md) | Customer/staff journeys, controls, booking, follow-ups and a demo walkthrough. |
| [Runbook](docs/runbook.md) | Startup, shared VPS, proxy configuration, backups and operational recovery. |
| [Integrations](docs/integrations.md) | OpenAI, Google Calendar, Resend and live smoke setup. |
| [API](docs/api.md) | Routes, authentication, search/pagination and response semantics. |
| [Architecture](docs/architecture.md) | Components, state boundaries, durable actions and storage. |
| [Status and limitations](docs/status.md) | Dated verification evidence, deployment boundary and unsupported capabilities. |

Historical design/acceptance material is indexed in [status](docs/status.md#historical-design). It describes an earlier target stack, not the current implementation.

## Commands

| Command | Purpose |
| --- | --- |
| `npm start` | Server with embedded worker by default. |
| `npm run build` | Syntax checks and deployment copy into `dist/`; no transpilation. |
| `npm test` | Unit, integration, HTTP and provider contract tests. |
| `npm run eval -- --mock` | Deterministic evaluation without paid requests. |
| `npm run check` | Build, tests and mock evaluation. |
| `docker compose up --build` | Build and start the base local Docker configuration. |

These are available commands, not a statement that they were just run. Backup, separate-worker and real-provider procedures are documented in the runbook/integration guide.

## Source layout

`src/` — service, schema, worker and providers; `web/` — browser UI; `scripts/` — operating commands; `tests/` — automated/browser scenarios; `evaluation/` and `evidence/` — dated results; `docs/` — documentation.
