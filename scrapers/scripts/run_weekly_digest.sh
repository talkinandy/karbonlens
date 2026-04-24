#!/bin/bash
# Weekly digest cron wrapper — T19.
# Posts to T17's /api/digest endpoint with the bearer secret. Installed by
# install-crontab.sh at Mon 00:00 UTC (= 07:00 WIB).
#
# Graceful-degradation contract: if RESEND_API_KEY or DIGEST_CRON_SECRET is
# absent or empty, logs a SKIP line and exits 0 so cron does not produce
# failure noise before Andy provisions the keys.

set -euo pipefail

ENV_FILE=/opt/karbonlens/.env
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/digest.log"
RESPONSE_BODY=/tmp/digest-response.json

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

mkdir -p "$LOG_DIR"

TS() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# Guard: either key missing/empty → log SKIP and exit 0 (not a failure).
if [[ -z "${RESEND_API_KEY:-}" || "${RESEND_API_KEY}" == "CHANGE_ME" \
    || -z "${DIGEST_CRON_SECRET:-}" || "${DIGEST_CRON_SECRET}" == "CHANGE_ME" ]]; then
    echo "{\"ts\":\"$(TS)\",\"event\":\"digest_skip\",\"reason\":\"RESEND_API_KEY or DIGEST_CRON_SECRET not set\"}" >> "$LOG_FILE"
    exit 0
fi

APP_BASE_URL="${APP_BASE_URL:-http://localhost:3001}"

echo "{\"ts\":\"$(TS)\",\"event\":\"digest_start\",\"url\":\"${APP_BASE_URL}/api/digest\"}" >> "$LOG_FILE"

HTTP_STATUS=$(curl -s -o "$RESPONSE_BODY" -w "%{http_code}" \
    -X POST "${APP_BASE_URL}/api/digest" \
    -H "Authorization: Bearer ${DIGEST_CRON_SECRET}" \
    -H "Content-Type: application/json" \
    --max-time 120 || echo "000")

if [[ ! "$HTTP_STATUS" =~ ^2[0-9][0-9]$ ]]; then
    BODY=$(head -c 500 "$RESPONSE_BODY" 2>/dev/null || echo "")
    echo "{\"ts\":\"$(TS)\",\"event\":\"digest_fail\",\"status\":\"${HTTP_STATUS}\",\"body\":$(printf '%s' "$BODY" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo '""')}" >> "$LOG_FILE"
    exit 1
fi

echo "{\"ts\":\"$(TS)\",\"event\":\"digest_done\",\"status\":\"${HTTP_STATUS}\"}" >> "$LOG_FILE"
exit 0
