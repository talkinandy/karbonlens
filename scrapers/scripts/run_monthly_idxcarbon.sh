#!/bin/bash
# Cron wrapper for the IDXCarbon monthly PDF scraper (T08 §3.5).
#
# Cron entry (installed by T19):
#   0 4 1 * * karbonlens /opt/karbonlens/scrapers/scripts/run_monthly_idxcarbon.sh
#
# Sources DATABASE_URL and any other scraper secrets from /opt/karbonlens/.env,
# runs the scraper inside the scrapers venv, and appends structured-JSON log
# lines to /var/log/karbonlens/idxcarbon.log.

set -euo pipefail

# Load env (tolerate missing file only when DATABASE_URL is already exported).
if [[ -f /opt/karbonlens/.env ]]; then
  set -a
  # shellcheck source=/dev/null
  source /opt/karbonlens/.env
  set +a
fi

cd /opt/karbonlens

/opt/karbonlens/scrapers/.venv/bin/python -m scrapers.idxcarbon.fetch_monthly \
  >> /var/log/karbonlens/idxcarbon.log 2>&1
