#!/bin/bash
# pg-restore-drill.sh — verify the latest backup is restorable and row counts
# match live DB within tolerance.
#
# Run as: sudo /opt/karbonlens/scripts/pg-restore-drill.sh
#   (needs sudo: uses sudo -u postgres for createdb/DROP DATABASE; the
#    karbonlens Postgres role intentionally has no CREATEDB privilege.)
#
# Cron line (see scrapers/scripts/pg-cron.conf):
#   0 5 * * 0 /opt/karbonlens/scripts/pg-restore-drill.sh >> /var/log/karbonlens/restore-drill.log 2>&1
#
# Exit 0 iff all table counts match within tolerance AND spot-check passes.

set -euo pipefail

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
# Include PID for parallel-safety (two simultaneous drill runs won't collide).
TEST_DB="kl_restore_drill_$$"

# Trap: drop the test DB on ANY exit (set -e abort, signal, or normal exit).
# Uses postgres superuser since karbonlens role has no CREATEDB/DROPDB.
# shellcheck disable=SC2317  # invoked via trap, not directly
cleanup_test_db() {
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS ${TEST_DB};" >/dev/null 2>&1 || true
}
trap cleanup_test_db EXIT

# Find the most recent backup file.
# shellcheck disable=SC2012  # ls -t sorts by mtime; find -printf is less portable
LATEST=$(ls -t "${BACKUP_DIR}"/karbonlens-*.dump 2>/dev/null | head -1)
if [ -z "${LATEST}" ]; then
  echo "ERROR: no .dump backup files found in ${BACKUP_DIR}" >&2
  exit 1
fi
echo "Using backup: ${LATEST}"

# Create the test database as postgres superuser.
sudo -u postgres createdb "${TEST_DB}"

# Restore: pg_restore reads pg_dump custom format directly.
# --no-owner / --no-privileges because the drill DB owner is postgres, not karbonlens.
pg_restore -h localhost -U karbonlens -d "${TEST_DB}" --no-owner --no-privileges "${LATEST}"

get_count() {
  PGPASSWORD="${PGPASSWORD}" psql -h localhost -U karbonlens -d "${TEST_DB}" -tAc "SELECT COUNT(*) FROM $1;"
}
get_live_count() {
  PGPASSWORD="${PGPASSWORD}" psql -h localhost -U karbonlens -d karbonlens -tAc "SELECT COUNT(*) FROM $1;"
}

PASS=0
FAIL=0

check_table() {
  local TABLE=$1
  local TOLERANCE=${2:-0}   # percent tolerance; default 0 = exact match
  local MIN=${3:-0}         # absolute minimum (sanity lower bound); 0 = skip
  local RESTORED LIVE DELTA PCT
  RESTORED=$(get_count "${TABLE}")
  LIVE=$(get_live_count "${TABLE}")
  DELTA=$(( LIVE - RESTORED ))
  if [ ${DELTA} -lt 0 ]; then DELTA=$(( -DELTA )); fi

  # Absolute minimum sanity check (catches silent empty-restore failures).
  if [ "${MIN}" -gt 0 ] && [ "${RESTORED}" -lt "${MIN}" ]; then
    echo "FAIL ${TABLE}: restored=${RESTORED} below minimum=${MIN}"
    FAIL=$(( FAIL + 1 ))
    return
  fi

  if [ "${TOLERANCE}" -eq 0 ]; then
    if [ "${RESTORED}" -eq "${LIVE}" ]; then
      echo "PASS ${TABLE}: restored=${RESTORED}, live=${LIVE}"
      PASS=$(( PASS + 1 ))
    else
      echo "FAIL ${TABLE}: restored=${RESTORED}, live=${LIVE}, delta=${DELTA}"
      FAIL=$(( FAIL + 1 ))
    fi
  else
    PCT=$(( DELTA * 100 / (LIVE + 1) ))
    if [ "${PCT}" -le "${TOLERANCE}" ]; then
      echo "PASS ${TABLE}: restored=${RESTORED}, live=${LIVE}, delta=${DELTA} (${PCT}% <= ${TOLERANCE}%)"
      PASS=$(( PASS + 1 ))
    else
      echo "FAIL ${TABLE}: restored=${RESTORED}, live=${LIVE}, delta=${DELTA} (${PCT}% > ${TOLERANCE}%)"
      FAIL=$(( FAIL + 1 ))
    fi
  fi
}

# Expected calibration (from docs/architecture.md §13):
#   projects = 64, satellite_alerts > 100k, issuances = 307, etc.
# satellite_alerts gets 1% tolerance (backup may predate in-progress scrape).
check_table projects                0       64
check_table satellite_alerts        1   100000
check_table issuances               0       10
check_table idx_monthly_snapshots   0        0
check_table regulatory_events       0        0
check_table project_scores          0        0
check_table users                   0        0

# Spot-check: MAX(id) of projects (catches silent FK truncation).
RESTORED_MAX=$(PGPASSWORD="${PGPASSWORD}" psql -h localhost -U karbonlens -d "${TEST_DB}" -tAc "SELECT MAX(id) FROM projects;")
LIVE_MAX=$(PGPASSWORD="${PGPASSWORD}" psql -h localhost -U karbonlens -d karbonlens -tAc "SELECT MAX(id) FROM projects;")
if [ "${RESTORED_MAX}" = "${LIVE_MAX}" ]; then
  echo "PASS projects.MAX(id): ${RESTORED_MAX}"
  PASS=$(( PASS + 1 ))
else
  echo "FAIL projects.MAX(id): restored=${RESTORED_MAX}, live=${LIVE_MAX}"
  FAIL=$(( FAIL + 1 ))
fi

echo "Results: ${PASS} PASS, ${FAIL} FAIL"
# EXIT trap drops ${TEST_DB} regardless of exit code.
if [ "${FAIL}" -gt 0 ]; then
  exit 1
fi
exit 0
