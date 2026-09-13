#!/bin/sh
set -eu
umask 077

revision=${SSH_ORIGINAL_COMMAND:-}
case "$revision" in
  ''|*[!0-9a-f]*) echo 'Expected a Git commit SHA.' >&2; exit 1 ;;
esac
test "${#revision}" -eq 40 || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }

app_dir=/opt/leadloom
exec 9>/opt/leadloom.deploy.lock
flock -n 9 || { echo 'A Leadloom deployment is already running.' >&2; exit 1; }
staging_dir=$(mktemp -d /opt/leadloom.deploy.XXXXXX)
trap 'rm -rf "$staging_dir"' EXIT HUP INT TERM

tar --no-same-owner -xzf - -C "$staging_dir"
for file in src/main.mjs web/index.html package.json compose.yaml compose.vps.yaml; do
  test -f "$staging_dir/$file"
done
docker compose --project-name leadloom --project-directory "$app_dir" \
  --env-file "$app_dir/.env" \
  -f "$staging_dir/compose.yaml" -f "$staging_dir/compose.vps.yaml" config --quiet

cd "$app_dir"
export COMPOSE_FILE=compose.yaml:compose.vps.yaml
export COMPOSE_PROJECT_NAME=leadloom
# ponytail: in-place deployment with brief downtime; use release directories if automatic code rollback is needed.
# Stop before replacing bind-mounted files so requests cannot see a mixed revision.
docker compose stop app
for directory in src web; do
  rsync -a --delete --chmod=D755,F644 "$staging_dir/$directory/" "$app_dir/$directory/"
done
for file in package.json compose.yaml compose.vps.yaml; do
  install -m 644 "$staging_dir/$file" "$app_dir/$file"
done
docker compose up -d --no-build --pull never --force-recreate --wait --wait-timeout 120 app
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3400/api/health >/dev/null
printf '%s\n' "$revision" > "$app_dir/.deployed-revision"
printf 'Deployed %s\n' "$revision"
