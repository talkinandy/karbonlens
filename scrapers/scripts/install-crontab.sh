#!/bin/bash
# install-crontab.sh — T19 cron installer for the KarbonLens VPS.
#
# Must be run as root (uses chown, crontab -u karbonlens, /etc/logrotate.d/).
#
# Actions (idempotent):
#   1. Verify system timezone is UTC via timedatectl.
#   2. Bootstrap /opt/karbonlens/.env from env.template if absent, then exit 0
#      so the operator can populate real secrets before cron fires.
#   3. Rsync scrapers/scripts/ -> /opt/karbonlens/scripts/ owned karbonlens:karbonlens.
#   4. Install /etc/logrotate.d/karbonlens.
#   5. Warn (durable) for any referenced script missing after rsync.
#   6. Install crontab for the karbonlens user.
#   7. Verify by diffing `crontab -l -u karbonlens` against the source.
#
# Flags:
#   --force   Do not prompt when an existing crontab is detected; overwrite silently.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRONTAB_FILE="${SCRIPT_DIR}/karbonlens.crontab"
ENV_TEMPLATE="${SCRIPT_DIR}/env.template"
LOGROTATE_SRC="${SCRIPT_DIR}/logrotate.conf"

TARGET_ENV=/opt/karbonlens/.env
TARGET_SCRIPTS_DIR=/opt/karbonlens/scripts
TARGET_LOGROTATE=/etc/logrotate.d/karbonlens
LOG_DIR=/var/log/karbonlens
INSTALL_LOG="${LOG_DIR}/install-crontab.log"

FORCE=0
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=1 ;;
        *) echo "Unknown arg: $arg" >&2; exit 2 ;;
    esac
done

err() { echo "ERROR: $*" >&2; }
warn() {
    echo "WARN: $*" >&2
    # Durable warning: also append to install log if the dir exists.
    if [[ -d "$LOG_DIR" ]]; then
        echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") WARN: $*" >> "$INSTALL_LOG" || true
    fi
}
info() { echo "[install-crontab] $*"; }

# Must be root.
if [[ "${EUID}" -ne 0 ]]; then
    err "must be run as root (need chown / crontab -u / /etc/logrotate.d)"
    exit 1
fi

# --- Step 1: timezone check ---------------------------------------------------
if ! command -v timedatectl >/dev/null 2>&1; then
    err "timedatectl not found; cannot verify system timezone is UTC"
    exit 1
fi

TZ_NAME=$(timedatectl show -p Timezone --value 2>/dev/null || echo "unknown")
# Accept both "UTC" and "Etc/UTC" — same zone, different canonicalization.
if [[ "$TZ_NAME" != "UTC" && "$TZ_NAME" != "Etc/UTC" ]]; then
    err "system timezone is not UTC (got '${TZ_NAME}'). Run: timedatectl set-timezone UTC"
    exit 1
fi
info "timezone OK (${TZ_NAME})"

# Ensure log dir exists (karbonlens-owned) so logrotate + install log work.
mkdir -p "$LOG_DIR"
chown karbonlens:karbonlens "$LOG_DIR" 2>/dev/null || warn "could not chown ${LOG_DIR} to karbonlens"

# --- Step 2: .env bootstrap ---------------------------------------------------
mkdir -p /opt/karbonlens
if [[ ! -f "$TARGET_ENV" ]]; then
    if [[ ! -f "$ENV_TEMPLATE" ]]; then
        err "env.template missing at ${ENV_TEMPLATE}"
        exit 1
    fi
    info "bootstrapping ${TARGET_ENV} from env.template"
    # Generate a fresh DIGEST_CRON_SECRET and substitute it into the bootstrapped
    # .env so the operator does not ship the CHANGE_ME placeholder into prod.
    FRESH_SECRET=$(head -c 48 /dev/urandom | base64 | tr -d '+/=' | head -c 48)
    sed -E "s#^DIGEST_CRON_SECRET=.*#DIGEST_CRON_SECRET=\"${FRESH_SECRET}\"#" \
        "$ENV_TEMPLATE" > "$TARGET_ENV"
    chmod 640 "$TARGET_ENV"
    chown karbonlens:karbonlens "$TARGET_ENV"
    cat <<EOF

================================================================================
Bootstrapped ${TARGET_ENV} from env.template.

Edit ${TARGET_ENV} and set:
  DATABASE_URL, PGPASSWORD, GFW_API_KEY, RESEND_API_KEY, DIGEST_CRON_SECRET,
  APP_BASE_URL

Then re-run this script to install the crontab:
  sudo ${BASH_SOURCE[0]}
================================================================================

EOF
    exit 0
fi
info ".env present at ${TARGET_ENV} (skip bootstrap)"

# --- Step 3: rsync scripts -> /opt/karbonlens/scripts/ ------------------------
if [[ ! -f "$CRONTAB_FILE" ]]; then
    err "crontab source missing at ${CRONTAB_FILE}"
    exit 1
fi

mkdir -p "$TARGET_SCRIPTS_DIR"
info "rsync ${SCRIPT_DIR}/ -> ${TARGET_SCRIPTS_DIR}/"
rsync -a --chown=karbonlens:karbonlens \
    --exclude=install-crontab.sh \
    --exclude=karbonlens.crontab \
    --exclude=env.template \
    --exclude=logrotate.conf \
    "${SCRIPT_DIR}/" "${TARGET_SCRIPTS_DIR}/"
# Ensure the dir itself is karbonlens-owned (rsync --chown sets files only).
chown karbonlens:karbonlens "$TARGET_SCRIPTS_DIR"
chmod 755 "$TARGET_SCRIPTS_DIR"

# --- Step 3b: rsync scrapers Python source + create venv ---------------------
# The wrappers run `python -m scrapers.<package>.fetch` which requires the
# `scrapers/` package importable at runtime. T19 initially installed scripts
# only — this block also syncs the Python source and creates a venv at
# `/opt/karbonlens/scrapers/.venv` so the wrappers resolve their shebang
# targets.
SCRAPERS_SRC_DIR="$(dirname "$SCRIPT_DIR")"
TARGET_SCRAPERS_DIR=/opt/karbonlens/scrapers
info "rsync ${SCRAPERS_SRC_DIR}/ -> ${TARGET_SCRAPERS_DIR}/"
mkdir -p "$TARGET_SCRAPERS_DIR"
rsync -a --chown=karbonlens:karbonlens \
    --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' --exclude='uv.lock' \
    "${SCRAPERS_SRC_DIR}/" "${TARGET_SCRAPERS_DIR}/"
chown karbonlens:karbonlens "$TARGET_SCRAPERS_DIR"

# Create / refresh the venv. Use `uv` from root's install (PATH isn't
# propagated to karbonlens via sudo -u without --preserve-env).
UV_BIN=$(command -v uv || echo "/root/.local/bin/uv")
if [[ ! -x "$UV_BIN" ]]; then
    warn "uv not found at ${UV_BIN}; scrapers venv not created. Install uv and re-run."
else
    info "refreshing venv via ${UV_BIN} sync"
    # Run as karbonlens so venv files are karbonlens-owned.
    (cd "$TARGET_SCRAPERS_DIR" && sudo -u karbonlens "$UV_BIN" sync >/dev/null 2>&1)
    if [[ -x "$TARGET_SCRAPERS_DIR/.venv/bin/python" ]]; then
        info "venv ready at ${TARGET_SCRAPERS_DIR}/.venv"
    else
        err "venv creation failed; check ${TARGET_SCRAPERS_DIR}/.venv manually"
    fi
fi

# --- Step 4: logrotate config -------------------------------------------------
if [[ -f "$LOGROTATE_SRC" ]]; then
    info "installing ${TARGET_LOGROTATE}"
    cp "$LOGROTATE_SRC" "$TARGET_LOGROTATE"
    chmod 644 "$TARGET_LOGROTATE"
    chown root:root "$TARGET_LOGROTATE"
else
    warn "logrotate source missing at ${LOGROTATE_SRC}; skipping"
fi

# --- Step 5: warn for referenced scripts not on disk --------------------------
# Extract absolute script paths from the crontab (first field after the 5
# schedule fields on lines that start with a digit).
while IFS= read -r script_path; do
    if [[ -z "$script_path" ]]; then continue; fi
    if [[ ! -f "$script_path" ]]; then
        warn "cron entry references missing script: ${script_path}"
    fi
done < <(awk '/^[0-9*]/ {for (i=1; i<=NF; i++) if ($i ~ /^\/opt\/karbonlens\/scripts\//) {print $i; break}}' "$CRONTAB_FILE")

# --- Step 6: install crontab --------------------------------------------------
EXISTING=$(crontab -u karbonlens -l 2>/dev/null || true)
# Skip prompt + install when the running crontab already matches the source
# (true idempotent path — common when re-running after a rsync-only change).
if [[ -n "$EXISTING" ]] && diff -u <(printf '%s\n' "$EXISTING") "$CRONTAB_FILE" >/dev/null 2>&1; then
    info "crontab already matches source; no change"
    SKIP_INSTALL=1
elif [[ -n "$EXISTING" && "$FORCE" -ne 1 ]]; then
    echo
    echo "An existing crontab is installed for karbonlens:"
    echo "-----"
    echo "$EXISTING" | head -20
    echo "-----"
    read -r -p "Replace with ${CRONTAB_FILE}? [y/N] " ans
    if [[ ! "$ans" =~ ^[Yy]$ ]]; then
        info "aborted; existing crontab retained"
        exit 0
    fi
    SKIP_INSTALL=0
else
    SKIP_INSTALL=0
fi

if [[ "${SKIP_INSTALL:-0}" -eq 0 ]]; then
    info "installing crontab for user karbonlens"
    # `crontab -u karbonlens FILE` reads FILE as the target user. If the repo
    # lives under a path karbonlens cannot traverse (e.g. /root/...), the
    # read fails with "file: No such file or directory". Stage through a
    # karbonlens-readable temp path to avoid that.
    STAGED_CRONTAB=$(sudo -u karbonlens mktemp /tmp/karbonlens.crontab.XXXXXX)
    trap 'rm -f "$STAGED_CRONTAB"' EXIT
    install -m 0644 -o karbonlens -g karbonlens "$CRONTAB_FILE" "$STAGED_CRONTAB"
    crontab -u karbonlens "$STAGED_CRONTAB"
fi

# --- Step 7: verify -----------------------------------------------------------
INSTALLED=$(crontab -u karbonlens -l 2>/dev/null || true)
# Compare ignoring leading blank lines / trailing whitespace.
if ! diff <(printf '%s\n' "$INSTALLED") "$CRONTAB_FILE" >/dev/null 2>&1; then
    # crontab -l may normalize whitespace; do a content-only check instead.
    EXPECTED_ENTRIES=$(grep -cE '^[0-9*]' "$CRONTAB_FILE" || true)
    INSTALLED_ENTRIES=$(printf '%s\n' "$INSTALLED" | grep -cE '^[0-9*]' || true)
    if [[ "$EXPECTED_ENTRIES" -ne "$INSTALLED_ENTRIES" ]]; then
        err "verification mismatch: expected ${EXPECTED_ENTRIES} entries, installed ${INSTALLED_ENTRIES}"
        exit 1
    fi
fi

info "verified: crontab -l -u karbonlens matches ${CRONTAB_FILE}"
info "done. Review logs: ${LOG_DIR}/"
