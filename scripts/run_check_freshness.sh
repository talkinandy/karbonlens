#!/bin/bash
# scripts/run_check_freshness.sh — daily data-freshness monitor (alerts via Resend).
#
# Cron suggestion: 45 5 * * *  (daily 05:45 UTC, after the morning scrapers).

set -u -o pipefail

APP_ENV_FILE=/opt/karbonlens/app/.env.local
REPO=/opt/karbonlens/app
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/freshness.log"

mkdir -p "$LOG_DIR"

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"event\":\"freshness_fail\",\"error\":\"$APP_ENV_FILE not found\"}" >> "$LOG_FILE"
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$APP_ENV_FILE"
set +a

cd "$REPO" || exit 1
./node_modules/.bin/tsx scripts/check-data-freshness.ts >> "$LOG_FILE" 2>> "$LOG_FILE"
