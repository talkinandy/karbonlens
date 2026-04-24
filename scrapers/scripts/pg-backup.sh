#!/bin/bash
# pg-backup.sh — nightly pg_dump for the karbonlens database.
#
# Run as: sudo -u karbonlens /opt/karbonlens/scripts/pg-backup.sh
#
# Cron line (see scrapers/scripts/pg-cron.conf; installed alongside T19's crontab):
#   0 2 * * * /opt/karbonlens/scripts/pg-backup.sh >> /var/log/karbonlens/backup.log 2>&1
#
# Behavior:
#   - Sources /opt/karbonlens/.env (owns PGPASSWORD; T19 created this file).
#   - Acquires non-blocking flock on /var/lock/karbonlens-backup; exits 0 with
#     "already running" if a second instance tries to start.
#   - Writes pg_dump -Fc (custom format, zlib-compressed internally) to a
#     .dump.partial file; renames to final .dump on success.
#   - trap ERR/INT/TERM/EXIT cleans any leftover .dump.partial on failure.
#   - Rotation: deletes .dump files older than 14 days ONLY when more than 14
#     backups exist (first-run safety so a cold system is not left with zero
#     backups by a mis-set clock).
#   - Structured JSON log lines to stdout (cron captures to backup.log via >>).

set -euo pipefail

# Guard: fail fast with a clear message if .env is absent.
if [ ! -f /opt/karbonlens/.env ]; then
  echo "ERROR: /opt/karbonlens/.env not found. Run T19 deployment first." >&2
  exit 1
fi

# shellcheck source=/dev/null
# shellcheck disable=SC1091
set -a
source /opt/karbonlens/.env
set +a

BACKUP_DIR=/var/lib/karbonlens/backups
LOCK_FILE=/var/lock/karbonlens-backup
DATE=$(date -u +%Y-%m-%d)
BACKUP_FILE="${BACKUP_DIR}/karbonlens-${DATE}.dump"
PARTIAL_FILE="${BACKUP_FILE}.partial"

log_json() {
  local event="$1"
  local extra="${2:-}"
  if [ -n "${extra}" ]; then
    echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"${event}\",${extra}}"
  else
    echo "{\"ts\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"event\":\"${event}\"}"
  fi
}

# Acquire non-blocking exclusive lock. -n means fail immediately if held.
# We re-exec under flock so the lock is held for the entire script lifetime
# and released when the shell exits (kernel-managed, survives crashes).
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  log_json "backup_skip" "\"reason\":\"already running\""
  exit 0
fi

# Trap: remove any partial file on any error, signal, or normal exit.
# Triggered on: set -e abort, SIGINT (Ctrl-C), SIGTERM (OOM killer / systemd),
# and EXIT (covers normal path after success — at that point PARTIAL_FILE is
# already renamed away, so rm -f is a harmless no-op).
# shellcheck disable=SC2317  # invoked via trap, not directly
cleanup_partial() {
  if [ -f "${PARTIAL_FILE}" ]; then
    rm -f "${PARTIAL_FILE}"
    log_json "partial_cleaned" "\"file\":\"${PARTIAL_FILE}\""
  fi
}
trap cleanup_partial ERR INT TERM EXIT

log_json "backup_start" "\"file\":\"${BACKUP_FILE}\""

# pg_dump -Fc applies zlib compression internally (level 6). No additional
# gzip — double-compression wastes CPU and inflates file size. Write to
# .dump.partial first so cron-fired runs never leave a half-written file at
# the final path (important for rotation + restore drill).
pg_dump -Fc -h localhost -U karbonlens karbonlens > "${PARTIAL_FILE}"

# Atomic rename (same filesystem) — partial becomes final.
mv -f "${PARTIAL_FILE}" "${BACKUP_FILE}"

SIZE=$(stat -c %s "${BACKUP_FILE}")
log_json "backup_done" "\"file\":\"${BACKUP_FILE}\",\"size\":${SIZE}"

# Rotation: only trigger when more than 14 backups exist (first-run safety —
# a freshly-provisioned system with a mis-set clock should not end up with
# zero backups because the single newest file tripped an mtime rule).
# Count current .dump files; skip rotation if count <= 14.
#
# find -L dereferences the start-path symlink (BACKUP_DIR may be a symlink
# to a Hetzner volume per T20 §3.1). Without -L, find sees only the link
# itself and descends into nothing, so rotation silently no-ops.
COUNT=$(find -L "${BACKUP_DIR}" -maxdepth 1 -name 'karbonlens-*.dump' -type f | wc -l)
if [ "${COUNT}" -gt 14 ]; then
  # -print logs deleted filenames to backup.log for operational visibility.
  find -L "${BACKUP_DIR}" -maxdepth 1 -name 'karbonlens-*.dump' -type f -mtime +14 -print -delete
  AFTER=$(find -L "${BACKUP_DIR}" -maxdepth 1 -name 'karbonlens-*.dump' -type f | wc -l)
  log_json "rotation_done" "\"before\":${COUNT},\"after\":${AFTER}"
else
  log_json "rotation_skip" "\"count\":${COUNT},\"reason\":\"<=14 backups, first-run safety\""
fi

# On success, clear the trap so EXIT does not try to re-clean a file that
# was already renamed (cleanup_partial is safe but logging noise).
trap - ERR INT TERM EXIT

exit 0
