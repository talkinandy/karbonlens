#!/bin/bash
# Nightly IndexNow delta-ping (T33 Phase 4A).
#
# Cron: 30 2 * * *  (daily 02:30 UTC — after the 02:00 UTC pg-backup).
#
# Collects URLs whose underlying content changed in the last 24h and
# submits them to IndexNow via scripts/indexnow-nightly.ts. The underlying
# helper (lib/seo/indexnow.ts) is a no-op when INDEXNOW_KEY is unset, so
# this cron is safe to install before the key is provisioned — it will
# just log one stderr warning per run until then.

set -u -o pipefail

ENV_FILE=/opt/karbonlens/.env
REPO=/opt/karbonlens/app
LOG_DIR=/var/log/karbonlens
LOG_FILE="${LOG_DIR}/indexnow.log"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "ERROR: $ENV_FILE not found" >&2
    exit 1
fi

set -a
# shellcheck source=/dev/null
source "$ENV_FILE"
set +a

mkdir -p "$LOG_DIR"

cd "$REPO"
./node_modules/.bin/tsx scripts/indexnow-nightly.ts >> "$LOG_FILE" 2>> "$LOG_FILE"
