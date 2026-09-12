# Context7 and documentation used during implementation

Access date: September 10, 2026.

## Context7 queries performed

1. `resolve-library-id`: Next.js → `/vercel/next.js`.
   `query-docs`: standalone output and `/api` rewrites to a separate NestJS backend.
   Documentation was retrieved, **but Next.js was not included in the standalone edition** after npm package downloads were found to be unavailable. This query is not presented as a Next.js audit or implementation.
2. `resolve-library-id`: Node.js → `/websites/nodejs_latest-v22_x_api`.
   `query-docs`: `node:sqlite DatabaseSync`, prepared statements `run/get/all`, and `exec` for SQL transactions.
   The retrieved APIs were used in `src/db.mjs`, `src/schema.sql`, and `src/service.mjs`, then tested locally with Node.js 22.16.0.

## Primary sources

- Node SQLite: https://nodejs.org/docs/latest-v22.x/api/sqlite.html
- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- Google Calendar events.insert: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Resend idempotency keys: https://resend.com/docs/dashboard/emails/idempotency-keys
- Next.js standalone output, researched but not used: https://nextjs.org/docs/app/api-reference/config/next-config-js/output

Reading documentation does not replace running tests. Local tests confirm the scenarios listed in the reports, not the readiness of real Google/Resend/OpenAI accounts. A "0 vulnerabilities" result when creating a lockfile without dependencies is not an independent security audit of the application.
