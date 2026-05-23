#!/bin/bash
# scripts/run_seo_baseline_check.sh — SEO Phase 1 baseline-crawl monitor.
#
# Probes the IndexNow endpoint at api.indexnow.org, www.bing.com and
# yandex.com with a single URL (the homepage). Each engine returns 422
# until they have baseline-crawled the domain; once they do, the status
# flips to 200/202.
#
# Cron: every 4 hours (15 */4 * * *).
#
# Outputs:
#   - NDJSON probe + transition events appended to
#     /var/log/karbonlens/seo-baseline.log
#   - Last-seen status per engine cached in
#     /var/lib/karbonlens/seo-baseline-state  (one `engine:status` per line)
#   - On FIRST all-2xx state: send one-shot email via Resend, then write
#     /var/lib/karbonlens/seo-baseline-notified (sentinel — prevents repeats)
#
# When an engine transitions 422 -> 2xx, the log gets a TRANSITION banner.
# `tail -F /var/log/karbonlens/seo-baseline.log` is the live status tap.

set -u -o pipefail

ENV_FILE=/opt/karbonlens/.env
APP_ENV_FILE=/opt/karbonlens/app/.env.local
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/seo-baseline.log"
STATE_FILE=/var/lib/karbonlens/seo-baseline-state
NOTIFIED_SENTINEL=/var/lib/karbonlens/seo-baseline-notified

if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi

# Load INDEXNOW_KEY + RESEND_API_KEY from the shell env file.
set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
# Pull ADMIN_EMAILS from the app env file (it lives there, not in the
# shell env). Best-effort — if absent we fall back to the project owner's
# email. The grep is to avoid `source`-ing a file that may contain values
# with shell-incompatible characters.
if [[ -f "$APP_ENV_FILE" ]]; then
  ADMIN_EMAILS_LINE=$(grep -E "^ADMIN_EMAILS=" "$APP_ENV_FILE" || true)
  if [[ -n "$ADMIN_EMAILS_LINE" ]]; then
    export ADMIN_EMAILS="${ADMIN_EMAILS_LINE#ADMIN_EMAILS=}"
  fi
fi
set +a

if [[ -z "${INDEXNOW_KEY:-}" ]]; then
  echo "ERROR: INDEXNOW_KEY not set in $ENV_FILE" >&2
  exit 1
fi

mkdir -p "$LOG_DIR" "$(dirname "$STATE_FILE")"
touch "$STATE_FILE"

ENGINES=("api.indexnow.org" "www.bing.com" "yandex.com")
NOW=$(date -u +%FT%TZ)
KEY_LOC="https://karbonlens.com/indexnow/${INDEXNOW_KEY}.txt"
PAYLOAD=$(printf '{"host":"karbonlens.com","key":"%s","keyLocation":"%s","urlList":["https://karbonlens.com/"]}' "$INDEXNOW_KEY" "$KEY_LOC")

# Read previous state into an associative array.
declare -A PREV
while IFS=: read -r engine status; do
  [[ -n "$engine" && -n "$status" ]] && PREV[$engine]="$status"
done < "$STATE_FILE"

# Probe each engine, log, detect transitions.
declare -A NEW
all_ok=1
transitions=()
for engine in "${ENGINES[@]}"; do
  status=$(curl -sS -o /dev/null -w "%{http_code}" --max-time 10 \
    -X POST "https://${engine}/IndexNow" \
    -H "Content-Type: application/json; charset=utf-8" \
    -d "$PAYLOAD" 2>/dev/null || echo "000")
  prev=${PREV[$engine]:-"none"}
  NEW[$engine]="$status"

  echo "{\"ts\":\"$NOW\",\"event\":\"seo_baseline_probe\",\"engine\":\"$engine\",\"status\":\"$status\",\"prev\":\"$prev\"}" >> "$LOG_FILE"

  # 422 -> 2xx transition: crawler has accepted the domain.
  if [[ "$prev" == "422" && ( "$status" == "200" || "$status" == "202" ) ]]; then
    echo "{\"ts\":\"$NOW\",\"event\":\"seo_baseline_TRANSITION\",\"engine\":\"$engine\",\"from\":\"$prev\",\"to\":\"$status\",\"banner\":\"OK ${engine} now accepting IndexNow pings — baseline crawl complete\"}" >> "$LOG_FILE"
    transitions+=("$engine")
  fi

  if [[ "$status" != "200" && "$status" != "202" ]]; then
    all_ok=0
  fi
done

# Persist new state atomically.
TMP=$(mktemp)
for engine in "${ENGINES[@]}"; do
  echo "${engine}:${NEW[$engine]}" >> "$TMP"
done
mv "$TMP" "$STATE_FILE"

# One-shot completion notification: all three engines are 2xx AND we
# haven't already notified. Uses Resend (RESEND_API_KEY in $ENV_FILE),
# falls back gracefully if Resend isn't configured.
if [[ "$all_ok" -eq 1 && ! -f "$NOTIFIED_SENTINEL" ]]; then
  RECIPIENT="${ADMIN_EMAILS:-andy@fmg.co.id}"
  # ADMIN_EMAILS can be a comma list; take the first email if so.
  RECIPIENT_FIRST=${RECIPIENT%%,*}

  if [[ -n "${RESEND_API_KEY:-}" ]]; then
    state_summary=$(while IFS= read -r line; do echo "  - $line"; done < "$STATE_FILE")
    transitions_summary=$(printf '%s, ' "${transitions[@]}" | sed 's/, $//')
    html_body="<p>All three IndexNow engines are now accepting baseline pings for karbonlens.com.</p><pre>$(while IFS= read -r line; do printf '%s\n' "$line"; done < "$STATE_FILE")</pre><p>The nightly delta-ping cron (02:30 UTC) will start pushing changed URLs automatically. Crawler-driven indexation should compound from here over the next 2-4 weeks.</p><p>This is a one-shot notification (sentinel file: ${NOTIFIED_SENTINEL}). The 4-hourly monitor will keep running but won't email again.</p>"
    text_body=$(printf 'All three IndexNow engines are now accepting baseline pings for karbonlens.com.\n\nState:\n%s\n\nThe nightly delta-ping cron (02:30 UTC) will start pushing changed URLs automatically. Crawler-driven indexation should compound from here over the next 2-4 weeks.\n\nThis is a one-shot notification (sentinel: %s).' "$state_summary" "$NOTIFIED_SENTINEL")
    payload=$(jq -n \
      --arg from "KarbonLens <onboarding@resend.dev>" \
      --arg to "$RECIPIENT_FIRST" \
      --arg subject "[KarbonLens] IndexNow baseline crawl complete" \
      --arg html "$html_body" \
      --arg text "$text_body" \
      '{from: $from, to: [$to], subject: $subject, html: $html, text: $text}')

    send_status=$(curl -sS -o /tmp/seo-notify-resp.txt -w "%{http_code}" \
      -X POST https://api.resend.com/emails \
      -H "Authorization: Bearer ${RESEND_API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$payload" 2>/dev/null || echo "000")

    resp_body=$(head -c 400 /tmp/seo-notify-resp.txt 2>/dev/null || echo "")
    rm -f /tmp/seo-notify-resp.txt

    echo "{\"ts\":\"$NOW\",\"event\":\"seo_baseline_notify\",\"recipient\":\"$RECIPIENT_FIRST\",\"send_status\":\"$send_status\",\"resend_resp\":$(printf '%s' "$resp_body" | jq -Rs .)}" >> "$LOG_FILE"

    # Only write sentinel if Resend accepted (2xx). Retries on next cron run otherwise.
    if [[ "$send_status" == "200" || "$send_status" == "201" || "$send_status" == "202" ]]; then
      echo "$NOW" > "$NOTIFIED_SENTINEL"
    fi
  else
    echo "{\"ts\":\"$NOW\",\"event\":\"seo_baseline_notify_skip\",\"reason\":\"RESEND_API_KEY not set\"}" >> "$LOG_FILE"
  fi
fi

# Exit 0 if all engines are 2xx, 1 otherwise (still bootstrapping).
[[ "$all_ok" -eq 1 ]] && exit 0 || exit 1
