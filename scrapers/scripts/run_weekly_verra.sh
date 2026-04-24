#!/bin/bash
# Weekly Verra scraper — cron target.
# Cron schedule (installed by T19): 0 2 * * 1  (Mondays 02:00 VPS local time)
# See /etc/cron.d/karbonlens
#
# The script deliberately does not `set -e` around the Python process so we
# can capture its exit code, write it to the log, and exit with the same
# code. The rest of the pipeline uses `set -eu -o pipefail`.

set -u -o pipefail

ENV_FILE=/opt/karbonlens/.env
VENV_PYTHON=/opt/karbonlens/scrapers/.venv/bin/python
REPO=/opt/karbonlens
LOG=/var/log/karbonlens/verra.log

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ENV_FILE"
set +a

cd "$REPO/scrapers"

mkdir -p "$(dirname "$LOG")"

echo "--- $(date --iso-8601=seconds) verra scraper start ---" >> "$LOG"
"$VENV_PYTHON" -m verra.fetch >> "$LOG" 2>&1
SCRAPER_EXIT=$?
echo "--- $(date --iso-8601=seconds) verra scraper end (exit $SCRAPER_EXIT) ---" >> "$LOG"
exit "$SCRAPER_EXIT"
