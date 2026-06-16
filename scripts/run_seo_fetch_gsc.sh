#!/bin/bash
# scripts/run_seo_fetch_gsc.sh — daily GSC Search Analytics + indexation pull.
#
# Cron: 15 3 * * *  (daily 03:15 UTC — after backup/indexnow, before score).
#
# Sources the app env file (where the GSC service-account credentials live)
# and runs the TypeScript fetcher. The fetcher is a no-op that logs
# `fetch_gsc_skip` if GSC_SERVICE_ACCOUNT_JSON_BASE64 / GSC_SITE_URL are
# absent, so this cron is safe to install before credentials are provisioned.

set -u -o pipefail

APP_ENV_FILE=/opt/karbonlens/app/.env.local
REPO=/opt/karbonlens/app
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/seo-fetch-gsc.log"

mkdir -p "$LOG_DIR"

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"event\":\"fetch_gsc_fail\",\"error\":\"$APP_ENV_FILE not found\"}" >> "$LOG_FILE"
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$APP_ENV_FILE"
set +a

cd "$REPO" || exit 1
./node_modules/.bin/tsx scripts/seo/fetch-gsc.ts >> "$LOG_FILE" 2>> "$LOG_FILE"
