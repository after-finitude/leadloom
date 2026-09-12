# Runbook

## Startup and data

Run `npm start` from the repository root. The database is created automatically. The worker is enabled by default and polls durable actions approximately every 300 ms. `Ctrl+C` shuts down the server and waits for the current iteration. If startup fails, first check Node >=22.16.0, port availability, write access to the data directory, and that APP_ORIGIN exactly matches the browser address.

HTTP health: `GET /api/health`. Process errors do not print message bodies, secrets, or access tokens. Technical diagnostics are in the Execution Log. Full conversations are stored in the protected CRM, not stdout.

If the application runs but a booking/email does not complete, check Activity, the operation state, the selected provider, the email allowlist, and credentials. Do not change a record from unknown to confirmed directly in the database.

## Reverse proxy and limits

`TRUSTED_PROXIES` is empty by default: the application uses the TCP connection address and ignores `X-Forwarded-For`. For a proxy on the same host, you can set `TRUSTED_PROXIES=127.0.0.1,::1`; in Docker, specify the proxy address as seen by the application container. Only exact IPv4/IPv6 addresses are accepted, without CIDR ranges or hostnames. The ENV example and Compose pass this setting to the server.

A trusted proxy must append its client's actual address to `X-Forwarded-For`, for example in Nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. The application parses the chain from right to left until it reaches the first untrusted address; client-supplied values to its left are ignored. List only proxies trusted to construct this header.

Chat requests from a verified visitor session are limited per lead: multiple chats behind one IP do not share a polling limit. Staff login, the form, link exchange, and access recovery retain separate IP or email limits.

## Uncertain results

`unknown` does not mean the external action failed. In Activity, use **Reconcile** to look for an existing result. Direct Retry of unknown is prohibited. A confirmed existing result is persisted without creating another effect. If the provider cannot confirm the result, keep HUMAN ownership and investigate manually in the dedicated calendar/email dashboard.

Pending actions survive process loss. An expired lease for an LLM turn allows reprocessing of the original messages; recovery of an external send does not assume that no request occurred and moves to reconciliation instead.

## Conversation controls

Take over or a manual reply → HUMAN. Pause → paused, independently of ownership. Resume only clears the pause. Return to AI is an explicit return and requires a resolution reason for a review. STOP stops all automated outreach to the contact; an ordinary message or new intake does not restore consent. Restore consent is available only to an administrator with confirmation and a reason; it does not automatically change HUMAN to AI.

Manual editing locks the field against LLM overwrites by default. A conflict appears in history/handoff. Changing rules creates a version; an existing lead retains its previous version until an explicit recalculation.

## Backup / restore

`npm run backup` creates a consistent SQLite copy using VACUUM INTO. The snapshot contains personal data and must be stored securely. Keep the encryption key separate from the database. To restore, stop both processes, replace the database with the copy, and use the same key; do not overwrite an open file or delete the WAL of a running database.

`npm run demo:reset -- --confirm-stopped` requires the server/worker to be stopped, demo mode, all mock adapters, and a demo marker in the database. The command deletes only the configured demo SQLite file and its WAL/SHM files; it leaves data at other paths untouched. A full demo reset intentionally deletes the synthetic demo's audit records as well.

## Before real operation

Use a new live database, HTTPS, a dedicated calendar, your own passwords, an encryption key, a webhook secret, a verified email sender, spending controls, live-model evaluation, live smoke testing, and native browser E2E. A backup strategy, disk monitoring, and a restore test are required. The original specification's architecture (Postgres/Redis/Nest/Next) is not included in this delivery.
