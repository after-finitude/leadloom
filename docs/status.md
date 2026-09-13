# Status and limitations

Documentation snapshot: **13 September 2026**. This page separates recorded evidence from implementation and deployment claims. Documentation cleanup did not run tests, contact providers or redeploy the server.

## Recorded evidence

| Evidence | What it establishes | Boundary |
| --- | --- | --- |
| [Initial automated run](../evidence/unit-integration.tap) | Original delivery recorded 60 passing unit/integration/HTTP/provider-contract tests. | Historical artifact; not the current test count or a rerun of the current working tree. |
| [Mock evaluation](../evaluation/last-run.md) | Saved deterministic-parser evaluation; use the report's own date/results. | Does not measure a real LLM. Previous runs remain in `evaluation/history/`. |
| [Staff DOM smoke](../evidence/browser-dom-smoke.json), [customer DOM smoke](../evidence/browser-public-smoke.json) | Original UI checks over an HTTP bridge. | Simulated navigation; not native browser E2E. |
| [VPS browser audit, 13 September](../evidence/browser-audit-2026-09-13/report.md) | Principal customer/staff flows through the deployed HTTPS application, including booking, rescheduling, cancellation, controls and roles. | See the report for uncovered branches and findings. All providers were mock. |

The shared VPS demo was deployed alongside Docflow at [Leadloom](https://leadloom.176.98.40.150.sslip.io/) using the pinned runtime/Compose override in the [runbook](runbook.md#shared-vps-deployment). That recorded deployment did not require an image build; it does not establish that the base Dockerfile build was tested. This page is not a live uptime report.

Changes following the audit correct the meeting time-zone display, hardcoded login hints and tokenless unsubscribe screen. Regression checks were added to `tests/browser_e2e.py`; they have not been run. The original audit predates these corrections.

GitHub autodeploy is configured for pushes to `main`; see the [runbook](runbook.md#github-autodeploy). Use the GitHub Actions run and `/opt/leadloom/.deployed-revision` to identify the last successful deployment. Deployment health checks establish startup/readiness, not a repeat of the browser audit or regression suite.

## Unverified release paths

- Real OpenAI evaluation, Google Calendar effects and email delivery with real accounts.
- Successful recovery/unsubscribe email links, delayed follow-up delivery, uncertain-provider recovery and booking races through native browser scenarios. Some underlying cases have controlled automated tests; the browser audit does not cover all of them.
- Full mobile/multi-browser acceptance, pagination beyond the small deployed dataset, load testing and an independent security review.
- A current backup/restore drill and full AC-01–AC-26 acceptance of the original specification.

## Product and operating limits

- One-company standalone Node/SQLite edition; no Next/Nest/PostgreSQL/Redis stack, distributed cluster, NFS storage or automatic schema migration framework. See [architecture](architecture.md).
- Browser updates use polling, not WebSocket/SSE. The mock parser handles controlled English patterns, not arbitrary conversations.
- Email supports invitations/follow-ups, not inbound email chat; phone numbers require international notation. SMS and calls are not implemented.
- No registration, password-reset or staff-management UI. Initial account credentials are seeded once. Manager assignment has an API but no dedicated browser picker.
- FAQ/question wording must be aligned manually after business hours, service or duration changes. Follow-ups share a template rather than separate text per touch.
- A provider acknowledgement is not inbox delivery. An already-started external request may not be revocable when a contact opts out. An independent calendar editor is outside the local reservation transaction.
- Automation controls do not cancel confirmed meetings; appointment cancellation does not restart old follow-ups. See [product flow](product-flow.md).

## Historical design

Retained for traceability, outside the current operating documentation:

- [Specification v1.1](archive/Leadloom-TZ-v1.1.md): original requirements and AC identifiers.
- [Implementation plan v1.1](archive/Leadloom-Implementation-Plan-v1.1.md): original target-stack plan, not the current backlog.
- [Coverage snapshot, 10 September](archive/requirements-coverage-2026-09-10.md): historical requirement/evidence mapping.

Raw reports/screenshots remain in `evidence/` and `evaluation/`; they are records of individual runs, not prose to keep rewriting after every code change. The [initial source manifest](../evidence/initial-source-manifest.sha256) refers to its original package paths and hashes, not today's checkout.
