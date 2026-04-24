#!/bin/bash
# Daily score computation job — cron target.
# Cron schedule (installed by T19): 0 4 * * *  (every day at 04:00 VPS local
# time, Asia/Jakarta). Runs after the weekly scrapers (Verra 02:00 Mon, GFW
# 03:00 Mon) on their cadence days and harmlessly reprocesses on other days
# using the last-known data (see T09 §7 E6).
#
# See /etc/cron.d/karbonlens.
#
# The script deliberately does not `set -e` around the Python process so we
# can capture its exit code, write it to the log, and exit with the same
# code. The rest of the pipeline uses `set -u -o pipefail`.

set -u -o pipefail

ENV_FILE=/opt/karbonlens/.env
VENV_PYTHON=/opt/karbonlens/scrapers/.venv/bin/python
REPO=/opt/karbonlens
LOG=/var/log/karbonlens/score.log

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ENV_FILE"
set +a

cd "$REPO"

mkdir -p "$(dirname "$LOG")"

echo "--- $(date --iso-8601=seconds) score compute start ---" >> "$LOG"
"$VENV_PYTHON" -m scrapers.scoring.compute >> "$LOG" 2>&1
JOB_EXIT=$?
echo "--- $(date --iso-8601=seconds) score compute end (exit $JOB_EXIT) ---" >> "$LOG"
exit "$JOB_EXIT"
