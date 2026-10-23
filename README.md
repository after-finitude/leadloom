# Leadloom

**Version 1.2.0 · standalone edition**

Leadloom turns an incoming enquiry into a booked consultation. A customer leaves a request, an AI assistant talks to them in a private chat, collects the facts, scores the lead with explainable rules and offers a meeting slot. Staff see everything in a small CRM and can take over at any point.

```
Enquiry → private chat → qualification and scoring → consultation booking → staff follow-through
```

## Features

- **Customer side:** enquiry form (`/enquire`), private chat with the assistant, slot selection, secure return links, STOP/unsubscribe.
- **AI qualification:** the model extracts fields and phrases replies; scoring, eligibility, the next question and booking are decided by code, not by the model.
- **Staff CRM:** Inbox, Leads, lead profile (timeline, data, score, meetings), Activity log, Settings and a demo Outbox.
- **Roles:** administrator and manager.
- **Reliable side effects:** calendar and email operations are durable queued actions with retries and reconciliation of uncertain results.
- **Mock providers by default:** runs fully offline; real OpenAI/OpenRouter, Google Calendar and Resend adapters are opt-in.

## Tech stack

| Layer    | Technology                                                   |
| -------- | ------------------------------------------------------------ |
| Frontend | Svelte 5, TypeScript, Vite                                   |
| Backend  | Node.js 24 (`node:http`, `node:sqlite`), no runtime npm deps |
| Storage  | SQLite (single file, numbered SQL migrations)                |
| AI       | Mock parser, OpenAI or OpenRouter (structured output)        |
| Tooling  | ESLint, Prettier, `svelte-check`, `tsc`, `node --test`       |

## Quick start

Requires **Node.js 24+**.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open:

- Staff app: [localhost:3000](http://localhost:3000) (login at `/login`)
- Customer form: [localhost:3000/enquire](http://localhost:3000/enquire)

The first launch creates `data/leadloom.sqlite`, two staff accounts and eight synthetic leads. No `.env` is needed for the local demo.

| Demo account  | Email                  | Password               |
| ------------- | ---------------------- | ---------------------- |
| Administrator | admin@leadloom.local   | Leadloom-Demo-2026!    |
| Manager       | manager@leadloom.local | Leadloom-Manager-2026! |

These credentials only exist in a fresh local demo database. Accounts are seeded once: changing the passwords in `.env` later does not change stored accounts.

Notes:

- Rebuild (`npm run build`) after frontend changes when using `npm start`, or use `npm run dev` instead.
- Open the app at the exact configured `APP_ORIGIN` (default `http://localhost:3000`), including hostname and port: browser writes require an exact Origin match.

### Docker

```sh
docker compose up --build
```

Serves on `127.0.0.1:3000` with data in the `leadloom-data` volume.

## Configuration

Copy `.env.example` to `.env` and change what you need. Values already set in the environment take precedence over `.env`.

| Variable                     | Default                                      | Purpose                                                                      |
| ---------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------- |
| `APP_MODE`                   | `demo`                                       | `demo` or `live` (live requires HTTPS, strong secrets and an encryption key) |
| `PORT`, `HOST`, `APP_ORIGIN` | `3000`, `127.0.0.1`, `http://localhost:3000` | Where the server listens and the exact browser origin                        |
| `DATABASE_PATH`              | `./data/leadloom.sqlite`                     | SQLite file                                                                  |
| `WORKER_ENABLED`             | `true`                                       | Run the background worker inside the server                                  |
| `LLM_PROVIDER`               | `mock`                                       | `mock`, `openai` or `openrouter`                                             |
| `CALENDAR_PROVIDER`          | `mock`                                       | `mock` or `google`                                                           |
| `EMAIL_PROVIDER`             | `mock`                                       | `mock` (emails appear in the admin Outbox) or `resend`                       |
| `ENCRYPTION_KEY`             | empty                                        | Blank creates a local key; live needs 64 hex                                 |

The full list with comments is in [`.env.example`](.env.example). For real AI with simulated calendar and email (the portfolio setup), see [Integrations → OpenRouter](docs/integrations.md#portfolio-demo-openrouter-with-simulated-calendar-and-email).

## Development

```sh
npm run dev
```

Starts Vite on [localhost:5173](http://localhost:5173) and the API/worker on port 3000 with auto-restart. Use port 5173 in the browser; API requests are proxied. Stop any other backend on port 3000 first.

| Command                                   | What it does                                                      |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `npm run dev`                             | Frontend dev server + backend in watch mode                       |
| `npm start`                               | Production-style server with embedded worker (needs a build)      |
| `npm run worker`                          | Run the worker as a separate process                              |
| `npm run build`                           | Type checks, Vite bundle and release files in `dist/`             |
| `npm run typecheck`                       | Backend `tsc` and `svelte-check`, no output files                 |
| `npm test`                                | Unit, integration, HTTP and provider contract tests (build first) |
| `npm run eval -- --mock`                  | Deterministic qualification evaluation, no paid requests          |
| `npm run lint` / `npm run lint:fix`       | ESLint check / auto-fix                                           |
| `npm run format` / `npm run format:check` | Prettier write / check                                            |
| `npm run check`                           | Everything CI runs: lint, format, build, tests, mock evaluation   |
| `npm run seed`                            | Add the synthetic demo data                                       |
| `npm run backup`                          | Consistent SQLite snapshot                                        |
| `npm run demo:reset -- --confirm-stopped` | Delete the demo database (server must be stopped)                 |
| `npm run live:smoke -- --confirm`         | Optional smoke test against real providers                        |

Before pushing, run `npm run check`. It does not overwrite saved reports (`evidence/build.json`, `evaluation/last-run.*`); run `npm run build` or `npm run eval` directly to record new ones. An optional native browser scenario is `python tests/browser_e2e.py` against a running demo with mock providers.

## Project structure

```
src/                 Backend: HTTP API, domain logic, worker, providers
  migrations/        Numbered SQL migrations (never edit a released one)
  providers/         LLM, calendar and email adapters
web/                 Svelte frontend
  pages/             Screens
  components/        Shared UI and dialogs
  lib/               Typed API client and state
tests/               Automated tests and browser scenario
scripts/             Dev, build, seed, backup, reset, deploy
evaluation/          Qualification evaluation runner, scenarios, results
evidence/            Dated verification reports and screenshots
docs/                Documentation (see below)
data/                Local SQLite database and key (git-ignored)
```

## Documentation

| Document                                 | Read it for                                                      |
| ---------------------------------------- | ---------------------------------------------------------------- |
| [Product flow](docs/product-flow.md)     | Customer and staff journeys, controls, booking, demo walkthrough |
| [Architecture](docs/architecture.md)     | Components, state boundaries, durable actions, security          |
| [API](docs/api.md)                       | Routes, authentication, pagination, responses                    |
| [Integrations](docs/integrations.md)     | OpenRouter, OpenAI, Google Calendar, Resend, live smoke test     |
| [Runbook](docs/runbook.md)               | VPS deployment, reverse proxy, backups, recovery                 |
| [Status and limitations](docs/status.md) | What has been verified, what has not, known limits               |

`docs/archive/` holds the original specification and plan. They describe an earlier target stack (Postgres/Redis/Nest/Next), not this implementation.

## Deployment

Pushes to `main` run `npm run check` in GitHub Actions and deploy to the VPS. See the [runbook](docs/runbook.md) for the setup and for the checklist before real operation.

## License

[MIT](LICENSE)
