#!/bin/bash
# scripts/run_ingest_carbon_news.sh — carbon-news RSS ingest (WS3).
#
# Cron suggestion: 30 */6 * * *  (every 6h). Sources the app env (DATABASE_URL)
# and runs the TypeScript ingester, which dedupes by url so re-runs are cheap.

set -u -o pipefail

APP_ENV_FILE=/opt/karbonlens/app/.env.local
REPO=/opt/karbonlens/app
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/carbon-news-ingest.log"

mkdir -p "$LOG_DIR"

if [[ ! -f "$APP_ENV_FILE" ]]; then
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"event\":\"carbon_news_ingest_fail\",\"error\":\"$APP_ENV_FILE not found\"}" >> "$LOG_FILE"
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "$APP_ENV_FILE"
set +a

cd "$REPO" || exit 1
./node_modules/.bin/tsx scripts/ingest-carbon-news.ts >> "$LOG_FILE" 2>> "$LOG_FILE"
