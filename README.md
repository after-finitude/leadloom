# Leadloom

**1.2.0 · standalone edition.** Incoming enquiry → private chat → qualification and explainable scoring → consultation booking → staff follow-through. Built with Node.js HTTP, browser JavaScript and SQLite; no runtime npm dependencies.

## Run locally

Requires Node.js **24+** with `node:sqlite` and native TypeScript type stripping.

```sh
npm start
```

Open [localhost:3000](http://localhost:3000); customer form: [/enquire](http://localhost:3000/enquire). Use the exact configured `APP_ORIGIN`, including hostname and port. No `npm install` is needed. The default first launch creates a local database, staff accounts and eight synthetic leads.

| Default local account | Email                  | Password               |
| --------------------- | ---------------------- | ---------------------- |
| Administrator         | admin@leadloom.local   | Leadloom-Demo-2026!    |
| Manager               | manager@leadloom.local | Leadloom-Manager-2026! |

These credentials apply only to a fresh default local demo. The shared VPS uses generated credentials. Changing ENV passwords does not change accounts already stored in the database.

Providers default to mocks: qualification uses a limited deterministic parser, calendar events stay in SQLite, and emails appear in the administrator's Outbox. Real adapters require explicit configuration.

The portfolio demo can use **OpenRouter for real AI qualification with simulated calendar and email**. See [portfolio configuration](docs/integrations.md#portfolio-demo-openrouter-with-simulated-calendar-and-email); Google/Resend accounts are not needed for that setup.

## Documentation

| Document                                 | Read it for                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| [Product flow](docs/product-flow.md)     | Customer/staff journeys, controls, booking, follow-ups and a demo walkthrough. |
| [Runbook](docs/runbook.md)               | Startup, shared VPS, proxy configuration, backups and operational recovery.    |
| [Integrations](docs/integrations.md)     | OpenAI, Google Calendar, Resend and live smoke setup.                          |
| [API](docs/api.md)                       | Routes, authentication, search/pagination and response semantics.              |
| [Architecture](docs/architecture.md)     | Components, state boundaries, durable actions and storage.                     |
| [Status and limitations](docs/status.md) | Dated verification evidence, deployment boundary and unsupported capabilities. |

Historical design/acceptance material is indexed in [status](docs/status.md#historical-design). It describes an earlier target stack, not the current implementation.

## Commands

Install development tools with `npm ci --ignore-scripts`. ESLint checks JavaScript with recommended rules and separate Node/browser globals; Prettier formats supported source and documentation files. `.editorconfig` keeps editor whitespace consistent. These are development dependencies; starting the application still needs no npm installation.

TypeScript migration is incremental: `src/defaults.mts`, `src/rules.mts` and `src/time.mts` use the contracts in `src/types.ts`. `tsconfig.json` enables strict checking for migrated code, `allowJs` for existing imports and `noEmit`. Remaining JavaScript, including the browser UI, is not yet type-checked (`checkJs: false`). Node.js 24 runs `.mts` directly; browser assets stay JavaScript. Type checks do not replace validation of HTTP/LLM input at runtime.

| Command                                   | Purpose                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `npm start`                               | Server with embedded worker by default.                                      |
| `npm run typecheck`                       | Strict TypeScript checking and negative contract examples; no output files.  |
| `npm run build`                           | TypeScript check, JavaScript syntax checks and deployment copy into `dist/`. |
| `npm test`                                | Unit, integration, HTTP and provider contract tests.                         |
| `npm run eval -- --mock`                  | Deterministic evaluation without paid requests.                              |
| `npm run lint` / `npm run lint:fix`       | Check JavaScript / apply available automatic lint fixes.                     |
| `npm run format` / `npm run format:check` | Format files / check formatting without changing files.                      |
| `npm run check`                           | Lint, formatting check, build (including types), tests and mock evaluation.  |
| `docker compose up --build`               | Build and start the base local Docker configuration.                         |

These are available commands, not a statement that they were just run. Backup, separate-worker and real-provider procedures are documented in the runbook/integration guide.

Generated output, saved evidence/evaluation reports and archived documentation are excluded from formatting. GitHub Actions runs `npm run check` for pull requests and before deployment from `main`. Run formatting and address lint findings when changing code. No Git hooks run commands during commits.

## Source layout

`src/` — service, schema, worker and providers; `web/` — browser UI; `scripts/` — operating commands; `tests/` — automated/browser scenarios; `evaluation/` and `evidence/` — dated results; `docs/` — documentation.
