#!/bin/bash
# Weekly Market Wrap publisher wrapper — T33 Phase 4B.
#
# Cron (see install-crontab.sh on the Hetzner box):
#   0 6 * * 1   /opt/karbonlens/app/scripts/run_weekly_wrap.sh
#
# Runs Monday 06:00 UTC. Upstream scrapers in the pg-cron.conf run at
# 03:00 (daily-score) and 03:30 UTC (GFW / Verra / IDXCarbon refreshes),
# so by 06:00 the DB is already steady-state for the prior 7-day window
# the composer queries.
#
# Follows the same pattern as run_weekly_digest.sh: source env, log to
# /var/log/karbonlens/weekly-wrap.log, propagate the tsx exit code so
# cron reports real failures. No bearer-token guard needed — this hits
# the DB directly rather than an HTTP endpoint.

set -u -o pipefail

ENV_FILE=/opt/karbonlens/.env
REPO=/opt/karbonlens/app
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/weekly-wrap.log"

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

echo "{\"ts\":\"$(TS)\",\"event\":\"weekly_wrap_start\"}" >> "$LOG_FILE"

cd "$REPO" || {
    echo "{\"ts\":\"$(TS)\",\"event\":\"weekly_wrap_fail\",\"error\":\"cd $REPO failed\"}" >> "$LOG_FILE"
    exit 1
}

# tsx is resolved from node_modules so we don't depend on a global install.
# stdout/stderr from the script is one JSON line per event (see
# publish-weekly-wrap.ts), which appends cleanly to the NDJSON log file.
./node_modules/.bin/tsx scripts/publish-weekly-wrap.ts >> "$LOG_FILE" 2>&1
EXIT_CODE=$?

if [[ $EXIT_CODE -ne 0 ]]; then
    echo "{\"ts\":\"$(TS)\",\"event\":\"weekly_wrap_exit_nonzero\",\"code\":${EXIT_CODE}}" >> "$LOG_FILE"
    exit $EXIT_CODE
fi

echo "{\"ts\":\"$(TS)\",\"event\":\"weekly_wrap_done\"}" >> "$LOG_FILE"
exit 0
