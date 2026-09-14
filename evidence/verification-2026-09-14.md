# Local verification — 14 September 2026

Runtime: Node.js v24.14.1. Current working tree, including uncommitted OpenRouter support. No deployment or real provider requests.

| Check | Result | Boundary |
| --- | --- | --- |
| Build | Passed: 31 JavaScript modules checked and copied to `dist/`. | Native syntax/deployment-copy check, not a Docker build. |
| Automated tests | 72/72 passed across the initial run and HTTP retry. | First run passed 60; 12 HTTP tests could not bind loopback under the sandbox (`EPERM`). All 12 passed after granting local-port access. |
| OpenRouter contract | Passed. | Injected responses verify endpoint, key/model, strict schema, repair after invalid JSON, error 402, and mock calendar/email selection. No real model was called. |
| Mock evaluation | 24/24 scenarios, 38/38 declared fields, 8/8 expected bookings, zero false bookings. | Deterministic parser only; see `evaluation/last-run.md`. |
| Native browser | Passed in headless Google Chrome; zero page errors. | Local server on 127.0.0.1:3487, all providers mock, isolated in-memory database. See `native-browser-e2e.json`. |

Commands: `npm run check` with all providers forced to mock; after the sandbox bind failure, `node --test tests/http.test.mjs` with loopback permission, then `npm run eval -- --mock` separately. The combined command itself exited at the initial HTTP failure; it was not reported as an uninterrupted successful run.

Python Playwright was unavailable. The existing `tests/browser_e2e.py` scenario was translated into a temporary Node script using bundled Playwright and installed Chrome. The browser covered tokenless unsubscribe, new enquiry and qualification, stale/taken slot recovery, slot refresh, booking persistence, blank login fields, staff search/profile, appointment time in a different browser timezone, and STOP. No mobile or multi-browser acceptance is claimed.

Remaining: real OpenRouter model evaluation after configuring credentials/model. Google Calendar and Resend remain deliberately simulated for the portfolio demo.
