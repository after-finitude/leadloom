# Runbook

## Startup and data

Run `npm start` from the repository root. The database is created automatically. The worker is enabled by default and polls durable actions approximately every 300 ms. `Ctrl+C` shuts down the server and waits for the current iteration. If startup fails, first check Node >=22.16.0, port availability, write access to the data directory, and that APP_ORIGIN exactly matches the browser address.

Copy `.env.example` to `.env` for configuration; environment variables take precedence. Default storage is `data/leadloom.sqlite`. To use a separate worker, set `WORKER_ENABLED=false` on the server and run `npm run worker` with the same absolute database path and encryption key. Both processes need the same host's local disk. `npm run seed` adds the synthetic demo seed under its configured mode restrictions.

HTTP health: `GET /api/health`. Process errors do not print message bodies, secrets, or access tokens. Technical diagnostics are in the Execution Log. Full conversations are stored in the protected CRM, not stdout.

If the application runs but a booking/email does not complete, check Activity, the operation state, the selected provider, the email allowlist, and credentials. Do not change a record from unknown to confirmed directly in the database.

## Reverse proxy and limits

`TRUSTED_PROXIES` is empty by default: the application uses the TCP connection address and ignores `X-Forwarded-For`. For a proxy on the same host, you can set `TRUSTED_PROXIES=127.0.0.1,::1`; in Docker, specify the proxy address as seen by the application container. Only exact IPv4/IPv6 addresses are accepted, without CIDR ranges or hostnames. The ENV example and Compose pass this setting to the server.

A trusted proxy must append its client's actual address to `X-Forwarded-For`, for example in Nginx: `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. The application parses the chain from right to left until it reaches the first untrusted address; client-supplied values to its left are ignored. List only proxies trusted to construct this header.

Chat requests from a verified visitor session are limited per lead: multiple chats behind one IP do not share a polling limit. Staff login, the form, link exchange, and access recovery retain separate IP or email limits.

## Uncertain results

`unknown` does not mean the external action failed. In Activity, use **Reconcile** to look for an existing result. Direct Retry of unknown is prohibited. A confirmed existing result is persisted without creating another effect. If the provider cannot confirm the result, keep HUMAN ownership and investigate manually in the dedicated calendar/email dashboard.

Pending actions survive process loss. An expired lease for an LLM turn allows reprocessing of the original messages; recovery of an external send does not assume that no request occurred and moves to reconciliation instead.

For ownership, pause, consent, review and stage semantics, use the [product flow](product-flow.md#4-staff-controls-and-deal-progress).

## Backup / restore

`npm run backup` creates a consistent SQLite copy using VACUUM INTO. The snapshot contains personal data and must be stored securely. Keep the encryption key separate from the database. To restore, stop both processes, replace the database with the copy, and use the same key; do not overwrite an open file or delete the WAL of a running database.

`npm run demo:reset -- --confirm-stopped` requires the server/worker to be stopped, demo mode, all mock adapters, and a demo marker in the database. The command deletes only the configured demo SQLite file and its WAL/SHM files; it leaves data at other paths untouched. A full demo reset intentionally deletes the synthetic demo's audit records as well.

## Before real operation

Use a new live database, HTTPS, a dedicated calendar, your own passwords, an encryption key, a webhook secret, a verified email sender, spending controls, live-model evaluation, live smoke testing, and native browser E2E. A backup strategy, disk monitoring, and a restore test are required. The original specification's architecture (Postgres/Redis/Nest/Next) is not included in this delivery.

An existing demo database cannot be switched to live mode: select a new `DATABASE_PATH`. Initial staff accounts are seeded once; changing ENV credentials does not change stored password hashes. Configure providers through [integrations](integrations.md); dated verification coverage is in [status](status.md).

## Shared VPS deployment

The trial deployment runs at `https://leadloom.176.98.40.150.sslip.io` on `176.98.40.150`, alongside Docflow Hub. It uses mock providers and synthetic demo data. Files live in `/opt/leadloom`; `compose.vps.yaml` extends `compose.yaml` with a pinned Node.js 24 image, a 256 MiB memory limit, a non-root user, read-only source mounts, and bounded container logs. No image build or npm installation is required.

The host's `/opt/leadloom/data` directory is a separate writable bind mount owned by UID/GID 1000. Root-only `/opt/leadloom/.env` stores generated staff passwords, the webhook secret, encryption key, image digest, origin, and trusted proxy address. Credentials are not the public README demo passwords. Preserve both the database and its encryption key when backing up or updating the deployment.

Manage only Leadloom from `/opt/leadloom`:

```sh
docker compose -f compose.yaml -f compose.vps.yaml up -d --no-build
docker compose -f compose.yaml -f compose.vps.yaml stop
```

The application listens on host loopback port 3400 and joins the existing `docflow-hub_default` network with alias `leadloom`. The shared Caddy proxies the public hostname to `leadloom:3000`. Its configuration is `/opt/docflow-hub/docker/Caddyfile`; preserve the Leadloom site block during Docflow deployments. The previous configuration is backed up beside that file as `Caddyfile.before-leadloom-*`.

A file bind mount can retain an older inode after a source file is replaced. To load the current host file without restarting Caddy, use:

```sh
docker exec -i docflow-hub-caddy-1 caddy reload --config /dev/stdin --adapter caddyfile < /opt/docflow-hub/docker/Caddyfile
```

If Caddy is recreated, check its network address and update Leadloom's `TRUSTED_PROXIES` if it changes, then recreate only the Leadloom service. The trial configuration trusts Caddy's current address, `172.18.0.8`; it does not trust the entire Docker subnet. Changing the public hostname also requires updating `APP_ORIGIN` and the Caddy site block.

## GitHub autodeploy

`.github/workflows/deploy.yml` sends pushes to `main` to this VPS; **Actions → Deploy → Run workflow** supports a manual run of `main`. Both projects hold `/var/lib/app-deploy/deploy.lock` through extraction and deployment; a second job waits up to 15 minutes, then fails safely. A pinned checkout action archives only `src/`, `web/` and `package.json` from the exact commit and sends them over SSH; the server does not need a Git checkout or GitHub token.

One-time setup requires Python 3, `rsync`, `runuser`, `prlimit`, `timeout` and `flock`. Create a system user/group `leadloom-unpack` with `/usr/sbin/nologin`, no home and no supplementary groups, and root-owned `/var/lib/app-deploy` with mode 0711. Install `scripts/extract-release.py` as `/usr/local/lib/leadloom-deploy/extract-release.py` (root-owned directory 0755, file 0644), and `scripts/deploy.sh` as `/usr/local/sbin/leadloom-deploy` (root-owned, mode 0700). Keep the app directory and Compose files root-owned and not writable by other users. Authorize a dedicated project's public key in `/root/.ssh/authorized_keys` using `restrict,command="/usr/local/sbin/leadloom-deploy"`, and store its private key as this repository's Actions secret `DEPLOY_SSH_KEY`. The workflow pins the host key read over the existing trusted connection. Personal SSH keys and application credentials are not uploaded to Actions.

The forced command accepts only a full commit SHA. The dedicated `leadloom-unpack` account validates and extracts source files without root or Docker access. It rejects links, special files, unsafe paths, duplicate entries, embedded `.env`/`.git` paths and any files outside the source allowlist. Extraction is limited to 120 seconds, 256 MiB address space, 16 MiB per file, 128 MiB total and 10,000 entries. `python3 scripts/test_deploy_archive.py` checks valid and malicious archives without Docker; run it only with explicit authorization.

Only after extraction succeeds does the script validate the server-owned Compose configuration, briefly stop Leadloom, replace `src/`, `web/` and `package.json`, then recreate its app service. It uses the already-installed pinned image without building or pulling, waits for health, and records successful deployment in `/opt/leadloom/.deployed-revision`. Compose, `.env`, data and Docflow services/Caddy are preserved. The GitHub job fails if extraction, configuration, startup or health fails.

This is an in-place deployment with a short interruption and no automatic database/code rollback. For bad application changes, revert the offending commit and push `main`. If the pipeline itself cannot recover, upload a known-good runtime archive through the existing administrator SSH connection and use the manual Compose procedure above. Database recovery is separate and uses a consistent backup with the same encryption key.

Changes to Compose, `scripts/deploy.sh` and `scripts/extract-release.py` require an administrator to review and install them separately; pushing source alone cannot replace privileged server configuration. A new pinned runtime image must be installed on the VPS before deploying a configuration that uses it. Test/build commands are not included in this deployment workflow; the health check establishes readiness, not full functional acceptance.

Repository access still permits changing application behavior and reading Leadloom's runtime secrets. This is not full isolation between applications on the shared VPS. GitHub currently rejects branch protection for these private repositories without a Pro upgrade; `main` is therefore still unprotected.
