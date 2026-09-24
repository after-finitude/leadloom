# Leadloom

**1.2.0 · standalone edition.** Incoming enquiry → private chat → qualification and explainable scoring → consultation booking → staff follow-through. Built with Svelte 5, TypeScript and Vite on the frontend; Node.js HTTP and SQLite on the backend. The production server has no runtime npm dependencies.

## Run locally

Requires Node.js **24+** with `node:sqlite` and native TypeScript type stripping.

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000); customer form: [/enquire](http://localhost:3000/enquire). Use the exact configured `APP_ORIGIN`, including hostname and port. Build once before starting from source; rebuild after frontend changes. The default first launch creates a local database, staff accounts and eight synthetic leads.

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

Install dependencies with `npm ci --ignore-scripts`. ESLint checks JavaScript, TypeScript and Svelte with recommended rules and separate Node/browser globals. Prettier includes `prettier-plugin-svelte`; `.editorconfig` keeps editor whitespace consistent. Runtime release archives already contain compiled browser assets, so the server needs no npm installation.

The frontend uses Svelte 5 components and TypeScript throughout, with strict checking in `web/tsconfig.json`. `svelte-check` checks components and browser modules; backend `tsc` checks migrated `.mts` modules and shared contracts in `src/types.ts`. Backend JavaScript is checked by `tsconfig.js.json` (`checkJs`, strict except implicit `any` parameters); API response types in `src/types.ts` are annotated on the functions that build them and shared with the browser app. Node.js 24 runs `.mts` directly; Vite compiles the frontend into hashed JS/CSS under `dist/web/assets/`. Runtime HTTP/LLM validation remains necessary.

Versions are pinned in the lockfile. Svelte 5.57.0, Vite 8.3.0 and their latest stable tooling were selected on 14 September 2026 using Context7 documentation and npm metadata. TypeScript stays at 6.0.3: the latest TypeScript 7 is outside the supported peer ranges of `svelte-check` and TypeScript ESLint. Node typings stay on the latest Node 24 version to match the server.

| Command                                   | Purpose                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `npm run dev`                             | Vite at localhost:5173 plus the API/worker on port 3000 (or `PORT`).         |
| `npm start`                               | Server with embedded worker; serves the previously built frontend.           |
| `npm run typecheck`                       | Strict backend TypeScript and Svelte component checks; no output files.      |
| `npm run build`                           | Type checks, server syntax checks, Vite bundle and release files in `dist/`. |
| `npm test`                                | Unit, integration, HTTP and provider contract tests.                         |
| `npm run eval -- --mock`                  | Deterministic evaluation without paid requests.                              |
| `npm run lint` / `npm run lint:fix`       | Check JS, TS and Svelte / apply available automatic lint fixes.              |
| `npm run format` / `npm run format:check` | Format files / check formatting without changing files.                      |
| `npm run check`                           | Lint, formatting check, build (including types), tests and mock evaluation.  |
| `docker compose up --build`               | Build and start the base local Docker configuration.                         |

Development uses `http://localhost:5173`; API requests are proxied to the backend. The dev script overrides `APP_ORIGIN` for its child process to keep cookies and CSRF on that browser origin, without changing `.env`. Stop another backend on the same port before using `npm run dev`. Production/local preview uses the configured `APP_ORIGIN` (normally `http://localhost:3000`).

HTTP tests that load pages require `npm run build` first. The optional native browser scenario is `python tests/browser_e2e.py`, against an already running isolated demo with mock providers. Old scripts that injected the vanilla renderer into a simulated page have been removed.

These are available commands, not a statement that they were just run. Backup, separate-worker and real-provider procedures are documented in the runbook/integration guide.

Generated output, saved evidence/evaluation reports and archived documentation are excluded from formatting. `npm run check` passes `--no-save` to the build and the mock evaluation, so it does not rewrite `evidence/build.json` or `evaluation/last-run.*`; run `npm run build` or `npm run eval` directly to record new ones. GitHub Actions runs `npm run check` for pull requests and before deployment from `main`. Run formatting and address lint findings when changing code. No Git hooks run commands during commits.

## Source layout

`src/` — service, schema, worker and providers; `web/pages/` — Svelte screens; `web/components/` — shared UI; `web/lib/` — typed API and Svelte state; `web/public/` — static assets; `scripts/` — operating commands; `tests/` — automated/browser scenarios; `evaluation/` and `evidence/` — dated results; `docs/` — documentation.
