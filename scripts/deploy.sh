#!/bin/sh
set -eu
umask 077
PATH=/usr/sbin:/usr/bin:/sbin:/bin
export PATH
unset CDPATH DOCKER_HOST DOCKER_CONTEXT DOCKER_CONFIG COMPOSE_FILE COMPOSE_ENV_FILES COMPOSE_PROFILES

revision=${SSH_ORIGINAL_COMMAND:-}
case "$revision" in
  ''|*[!0-9a-f]*) echo 'Expected a Git commit SHA.' >&2; exit 1 ;;
esac
test "${#revision}" -eq 40 || { echo 'Expected a full Git commit SHA.' >&2; exit 1; }

app_dir=/opt/leadloom
exec 9>/var/lib/app-deploy/deploy.lock
# ponytail: one shared VPS lock; split only after the server can afford parallel builds.
flock -w 900 9 || { echo 'Timed out waiting for another deployment.' >&2; exit 1; }
staging_dir=$(mktemp -d /var/lib/app-deploy/leadloom.XXXXXX)
trap 'rm -rf "$staging_dir"' EXIT HUP INT TERM
chown leadloom-unpack:leadloom-unpack "$staging_dir"
timeout --kill-after=5 120 runuser -u leadloom-unpack -- \
  prlimit --as=268435456 --fsize=16777216 --cpu=60 --nproc=32 -- \
  python3 -I /usr/local/lib/leadloom-deploy/extract-release.py leadloom "$staging_dir" 9>&-
# The receiver has exited. No archive-controlled process runs during the privileged copy.
chown -R root:root "$staging_dir"

cd "$app_dir"
export COMPOSE_FILE=compose.yaml:compose.vps.yaml
export COMPOSE_PROJECT_NAME=leadloom
docker compose config --quiet
# ponytail: in-place deployment with brief downtime; use release directories if automatic code rollback is needed.
# Stop before replacing bind-mounted files so requests cannot see a mixed revision.
docker compose stop app
for directory in src web; do
  rsync -rp --delete "$staging_dir/$directory/" "$app_dir/$directory/"
done
install -m 644 "$staging_dir/package.json" "$app_dir/package.json"
docker compose up -d --no-build --pull never --force-recreate --wait --wait-timeout 120 app
curl --fail --silent --show-error --max-time 15 http://127.0.0.1:3400/api/health >/dev/null
printf '%s\n' "$revision" > "$app_dir/.deployed-revision"
printf 'Deployed %s\n' "$revision"
