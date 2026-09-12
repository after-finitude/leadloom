# Leadloom 1.2.0 delivery status

Date: September 10, 2026. This is a NEW standalone implementation that was actually built, not a recovered copy of a previously promised archive.

## Completed work

- Direct startup of the Node.js 22.16.0 server, SQLite WAL, automatic schema creation, and demo seed.
- Standalone edition build: JS module syntax checks and assembly of `dist/`.
- 60 of 60 automated unit/integration/HTTP/provider-contract tests passed, with no skips (`evidence/unit-integration.tap`).
- 24 of 24 deterministic mock-parser scenarios passed (`evaluation/last-run.md`, `.json`). This is NOT evidence of OpenAI quality.
- 10 DOM checks of the manager UI and 6 checks of the form/chat/booking flow in Chromium. Data came from a running HTTP server, and actions were persisted in SQLite. See the two `browser-*-smoke.json` files in `evidence/`.
- Three-column rendering, composer visibility, Take over / Pause / Resume, profile, settings, log, mobile width; customer form → qualification → selected slot → mock appointment → STOP.
- Screenshots show this actual UI, not mockups or images of a fictional product.

## Not completed / not claimed

- Next.js, NestJS, PostgreSQL, Redis, and BullMQ are not used in this edition. The specification's stack has not been implemented.
- Native browser navigation and E2E through normal page loading: execution was blocked by Chromium administrative policy. DOM smoke testing used about:blank and an HTTP bridge with simulated navigation; it does not prove browser cookie/CSP/module-loading behavior. These headers/sessions were tested separately at the HTTP level; a standard `tests/browser_e2e.py` is included for the user to run.
- Real calls to OpenAI, Google Calendar, and Resend were not run. Contract tests of the real adapters substitute controlled HTTP responses.
- Real email delivery, real appointments, and external service SLAs have not been confirmed.
- Docker build / Docker Compose runtime were not run because Docker was unavailable in the environment.
- Public deployment, video, load testing, and an independent security review have not been completed.
- Full acceptance of all v1.1 requirements is not claimed. The scope matrix is in `docs/requirements-coverage.md`.

## Package contents

Source code, SQL schema, interface, tests, evaluation, safe ENV examples, Dockerfile/Compose, instructions, and evidence of local runs. There are no runtime npm dependencies; the lockfile was created by npm in offline mode. The package starts without npm install.

The archive excludes the user's database, encryption key, real `.env` files, integration account passwords, and node_modules. Standard public demo passwords are not production secrets; do not publish the demo on the internet with these passwords.
