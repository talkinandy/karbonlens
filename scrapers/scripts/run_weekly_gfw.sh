#!/bin/bash
# Weekly GFW (Global Forest Watch) alerts scraper — cron target.
# Cron schedule (installed by T19): 0 3 * * 1  (Mondays 03:00 VPS local time,
# Asia/Jakarta). Staggered after the Verra weekly run (02:00) so they don't
# contend for the DB or the psycopg connection pool.
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
LOG=/var/log/karbonlens/gfw.log

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi

# shellcheck source=/dev/null
set -a
source "$ENV_FILE"
set +a

# T19 guard: skip when GFW_API_KEY is unset/empty/placeholder so cron does not
# produce failure noise before Andy provisions the key.
if [[ -z "${GFW_API_KEY:-}" || "${GFW_API_KEY}" == "CHANGE_ME" ]]; then
    mkdir -p "$(dirname "$LOG")"
    echo "--- $(date --iso-8601=seconds) gfw scraper skip: GFW_API_KEY unset ---" >> "$LOG"
    exit 0
fi

cd "$REPO/scrapers"

mkdir -p "$(dirname "$LOG")"

echo "--- $(date --iso-8601=seconds) gfw scraper start ---" >> "$LOG"
"$VENV_PYTHON" -m gfw.fetch >> "$LOG" 2>&1
SCRAPER_EXIT=$?
echo "--- $(date --iso-8601=seconds) gfw scraper end (exit $SCRAPER_EXIT) ---" >> "$LOG"
exit "$SCRAPER_EXIT"
