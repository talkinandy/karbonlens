---
story: T20
title: Backups + pg_dump cron — spec audit
auditor: adversarial spec-auditor
date: 2026-04-22
verdict: CONDITIONAL PASS
blocking: 4
---

## Verdict

**Conditional pass. 4 blocking issues, 7 advisory flags.**

The spec is detailed and operationally literate. The symlink strategy, structured log format, UTC date suffix, and edge-case coverage (volume-full, DB offline, same-day overwrite) are well handled. However four issues must be resolved before implementation: a subtle pipe-in-`if` trap that breaks partial-file cleanup, the CREATEDB privilege gap for the restore drill, a double-compression design error, and a missing trap in the restore drill that leaves the test DB behind on crash. Seven advisory flags cover privacy exposure, off-site gap, silent rotation failures, restore drill integrity, and cross-story env dependency.

---

## Blocking issues

**B1 — Pipe-in-`if` swallows `set -e`; partial file is NOT cleaned up on disk-full.**

The backup script uses `set -euo pipefail` and wraps the dump in `if pg_dump ... | gzip > FILE; then`. This construction is correct for capturing the exit code of the pipe, but there is a critical gap: `set -euo pipefail` is suppressed inside `if` conditions — the shell does not abort on error inside an `if`-test expression. That part is intentional and fine. The real problem is that `gzip >` writes the output file as a stream; if the filesystem fills mid-write, `gzip` exits non-zero and the pipe fails, but the `if`-branch correctly catches `EXIT_CODE=$?`. So far so good.

However the spec's §3.2 comment claims: *"Partial file cleanup on `pg_dump` failure — prevents a zero-byte or truncated `.sql.gz` from being mistaken for a valid backup."* The `rm -f "${BACKUP_FILE}"` on the failure path only runs if the `if`-expression evaluates false — meaning pg_dump itself failed. If `pg_dump` succeeds but `gzip` fails (e.g., disk-full mid-stream), **the pipe exit code is the rightmost non-zero stage under `pipefail`**, so the `if` does catch it and `rm -f` fires. That part is actually OK.

The real gap: there is no `trap` for signals (SIGTERM, SIGKILL from OOM). If the process is killed mid-write (e.g., OOM killer fires because pg_dump is using memory), the `if`-branch never completes, `rm -f` never runs, and a partial file is left on disk. A subsequent rotation `find -mtime +14 -delete` will not remove a today-dated partial file, which will then silently pass the AC-6 `file` check (gzip header may be present even in a truncated file) and fail AC-4 restore drill.

**Fix required:** Add a `trap 'rm -f "${BACKUP_FILE}"' ERR INT TERM` immediately after the `BACKUP_FILE` variable is set, and remove it on successful completion (`trap - ERR INT TERM`). This is the idiomatic bash pattern for partial-file cleanup and covers all exit paths.

---

**B2 — Double compression: `-Fc | gzip` is wrong; pg_dump custom format is already compressed.**

The spec pipes `pg_dump -Fc` through `gzip`. `pg_dump -Fc` (custom format) applies zlib compression internally by default (compression level 6). Piping the already-compressed stream through `gzip` yields a file that is larger than either format alone, wastes CPU, and produces a file that cannot be fed directly to `pg_restore` without the gunzip step. This is a design error, not a minor inefficiency: at 50–200 MB uncompressed with good zlib ratio (~5–10x), re-gzipping an already-compressed stream typically achieves <1% further reduction and adds measurable backup latency.

Two correct alternatives; pick one:

- **Option A (recommended):** `pg_dump -Fc -h localhost -U karbonlens karbonlens > "${BACKUP_FILE%.gz}"` with `BACKUP_FILE` renamed to `karbonlens-${DATE}.pgdump`. File is natively decompressible by `pg_restore` with no gunzip step. AC-6 and the restore drill script (`gunzip -c | pg_restore`) must both be updated to match.
- **Option B:** `pg_dump -Fp -h localhost -U karbonlens karbonlens | gzip > "${BACKUP_FILE}"`. Plain SQL dump, gzipped. More portable (readable as text after gunzip, usable with plain `psql`). Larger file than `-Fc` but simpler restore path. Restore drill must change to `gunzip -c | psql` instead of `pg_restore`.

The current spec is inconsistent: the restore drill does `gunzip -c "${LATEST}" | pg_restore` which would attempt to feed a gzip-wrapped pg_dump-custom stream into `pg_restore`. That works only because pg_restore can auto-detect and gunzip the outer wrapper on some builds, but it is not guaranteed — the spec must pick one format and be consistent throughout.

**Fix required:** Choose Option A or B. Update `pg-backup.sh`, `pg-restore-drill.sh`, AC-1 (file size threshold), AC-6 (`file` checks), and OQ-3 (size estimates). Document the choice in §2.

---

**B3 — Restore drill leaves test DB on crash before the final `DROP DATABASE`.**

The restore drill's cleanup is:

```bash
psql ... -c "DROP DATABASE IF EXISTS ${TEST_DB};" 2>/dev/null || true
```

This unconditional `DROP` at the end of the script handles normal failure paths (e.g., `check_table` fails) because `set -euo pipefail` aborts the script and the shell exits — but the `DROP` is at the bottom of the script body, not in a `trap`. Under `set -e`, if any command before the final `DROP` exits non-zero, the script exits immediately and the `DROP` never runs.

Specifically: if `pg_restore` fails (corrupted backup, missing extensions, FK violation), the script exits via `set -e` before reaching the cleanup. The `karbonlens_restoretest` database is left on the server. On the next Sunday drill run, `DROP DATABASE IF EXISTS` at the top of the next run does clean it up — but only if the *next* run reaches that line. If the restore drill itself crashes early on the second run, you accumulate orphaned databases.

The spec's §7 edge case (vi) says "The test DB is always dropped on script exit (including on failure, via the unconditional `DROP DATABASE` call)." This claim is incorrect under `set -e`.

**Fix required:** Add `trap 'psql -h localhost -U karbonlens -d postgres -c "DROP DATABASE IF EXISTS ${TEST_DB};" 2>/dev/null || true' EXIT` immediately after `TEST_DB` is defined. The `EXIT` trap fires on all exits including `set -e` aborts, signals, and normal exit.

---

**B4 — CREATEDB privilege: T01 did not grant it; restore drill will fail silently on first run.**

Confirmed from `vps-setup.md` §4: `CREATE USER karbonlens WITH PASSWORD '...'` — no `CREATEDB` clause. The restore drill executes `CREATE DATABASE karbonlens_restoretest` as the `karbonlens` role; this will fail with `ERROR: permission denied to create database`.

The spec acknowledges this in OQ-4 and §7 edge case (vii) but does not mandate where the fix is applied. "T20 deployment must include `ALTER ROLE karbonlens CREATEDB;`" is vague: deployment notes in an OQ are not executed by the implementer unless they appear in the Definition of Done or the deployment runbook.

**Fix required:**

1. Add to DoD (§8): `sudo -u postgres psql -c "ALTER ROLE karbonlens CREATEDB;" has been run on VPS and verified via \du.`
2. Add to `docs/runbooks/backup-and-restore.md` under a new section "One-time privilege grant": the exact `ALTER ROLE` command, when to run it (before first restore drill), and verification (`\du` to confirm `Create DB` flag).
3. Close OQ-4 in the story frontmatter note; it is answered.

---

## Advisory flags

**A1 — `PGPASSWORD` sourcing: hard dependency on T19 having landed; no fallback.**

The backup script sources `/opt/karbonlens/.env` unconditionally with `set -euo pipefail` active. If T19 has not yet deployed this file, `source /opt/karbonlens/.env` fails with `No such file or directory` and the script exits non-zero. The crontab entry is installed by T19, so in practice T19 will land first. However the spec's blocked_by list says only `[T01]`, not `[T19]`. If an implementer runs T20 scripts manually before T19 has created `/opt/karbonlens/.env`, the failure message is opaque.

Advisory fix: add a guard before the `source` line:

```bash
if [ ! -f /opt/karbonlens/.env ]; then
  echo "ERROR: /opt/karbonlens/.env not found. Run T19 deployment first." >&2
  exit 1
fi
```

Or add T19 as a soft blocked_by in T20 frontmatter with a note.

---

**A2 — Volume has existing content (`pmxt-data`); symlink setup step uses `rmdir` which will fail if backups dir is non-empty.**

The spec's §3.1 symlink setup uses:

```bash
mv /var/lib/karbonlens/backups/* ... 2>/dev/null || true
rmdir /var/lib/karbonlens/backups
```

`rmdir` succeeds only on an empty directory. If any file was written to `/var/lib/karbonlens/backups/` before T20 runs (e.g., a manual test backup, a `.gitkeep` from T01), the `mv *` glob will have moved files and `rmdir` will succeed — but only if the glob matched everything. Hidden files (`.gitkeep`) are not matched by `*`. `rmdir` would then fail with "Directory not empty."

Confirmed from live VPS: `/var/lib/karbonlens/backups` is currently empty (only `.` and `..` per `ls -la`). But this is a timing dependency: if the directory gains any file between T01 and T20 landing, `rmdir` fails and the symlink is not created. The volume also has `/mnt/HC_Volume_105261137/pmxt-data` — a pre-existing tenant directory — confirming the volume is shared, not blank.

Advisory fix: replace `rmdir` with `rm -rf /var/lib/karbonlens/backups` (safe since contents were just moved) and document why in the comment. Also add verification that the volume target directory does not collide with `pmxt-data` (it does not — `karbonlens-backups` is a new name).

---

**A3 — Silent rotation failure: `find -mtime +14 -delete` has no output; permission errors are invisible.**

If the karbonlens user loses write permission on `BACKUP_DIR` (e.g., volume remounted read-only after fsck), `find -delete` fails silently — no output, no non-zero exit from `find` on permission errors for individual files. The script continues to `log "rotation_done"` regardless, giving a false-positive signal that rotation succeeded.

Advisory fix: add `-print` to the `find` command so deleted files are logged. Under `set -e`, if `find` itself exits non-zero (rare, but possible), the script will abort. Alternatively, store find output count and log it:

```bash
DELETED=$(find "${BACKUP_DIR}" -name 'karbonlens-*.sql.gz' -mtime +14 -print -delete | wc -l)
log "rotation_done" # extend JSON to include \"deleted\":${DELETED}
```

---

**A4 — Restore drill integrity gap: 1% tolerance on satellite_alerts masks subtle FK violations.**

For 246,576 rows, 1% tolerance permits 2,466 row discrepancy. A restore with a silent FK constraint violation (e.g., `ON CONFLICT` behaviour differences, orphaned FK rows silently dropped by `pg_restore --no-owner --no-privileges`) could drop hundreds of rows and pass the drill. The only per-table check is row count; there is no schema checksum, no spot-check of specific PKs, and no verification that extensions (PostGIS geometry columns) restored correctly.

Advisory fix for v0.1: add a spot-check of `MAX(id)` or a specific known-good row in `projects` and `satellite_alerts`. For v0.2: `pg_dump --schema-only` diff to verify DDL integrity.

---

**A5 — Encryption: plaintext backups contain OAuth tokens and user emails.**

OQ-1 defers encryption. The live DB contains an `accounts` table (Google OAuth `access_token`, `refresh_token`, `id_token`) and a `users` table (emails). pg_dump custom format is binary-encoded but not encrypted; `strings karbonlens-YYYY-MM-DD.pgdump` extracts tokens in plain text. Any user with read access to the backup directory (e.g., via a future misconfigured web server, or if the volume is ever detached and remounted elsewhere) can harvest live OAuth tokens.

Advisory for v0.1.1: add `gpg --symmetric --batch --passphrase-fd 0` piped from a `BACKUP_GPG_PASSPHRASE` var in `/opt/karbonlens/.env`. The runbook should include the decrypt step. This should move from OQ to a concrete v0.1.1 task before off-site rsync (OQ-2) is enabled, since rsync to a Hetzner Storage Box dramatically increases exposure surface.

---

**A6 — Off-site gap: single-box failure = total data loss for v0.1.**

OQ-2 defers off-site backup. A Hetzner CX32 host failure (not just disk failure) destroys both the live Postgres data and the Hetzner volume simultaneously if the volume is attached to that host. Hetzner volumes are block devices — they survive disk failure but NOT host-level catastrophe or accidental server deletion. The spec correctly identifies this but classifies it as v0.2. Given that the v0.1 dataset (64 projects, 246k alerts, 307 issuances) represents weeks of scraper runtime that cannot be trivially replayed, this risk warrants a v0.1.1 milestone rather than v0.2. A Hetzner Storage Box rsync cronjob (one additional line in `karbonlens.crontab`) is ~2 hours of work.

---

**A7 — T19 crontab uses `MAILTO=""` which suppresses all backup failure notifications.**

T19's `karbonlens.crontab` sets `MAILTO=""` to suppress cron mail spam. This also suppresses failure notifications from `pg-backup.sh`. The spec's §7 edge case (i) says "cron emails root (if `MAILTO` is set in the crontab)." This is contradicted by T19's actual crontab which sets `MAILTO=""`. T20's failure detection path in v0.1 is therefore: check `backup.log` manually, or notice the backup file is stale. There is no active alerting.

This is not a blocker (both specs acknowledge it and defer alerting to v0.2), but T20 §7 edge case (i) contains a factual error: cron will NOT email root because T19 sets `MAILTO=""`. The spec text should be corrected to: "The failure appears in `backup.log`. No automatic notification in v0.1 (T19 sets `MAILTO=""`). Check the log or configure Healthchecks.io (v0.2, OQ-5)."

---

## Missing sections / gaps

- **No runbook section for one-time CREATEDB grant.** `backup-and-restore.md` (specified in §5) does not include the `ALTER ROLE karbonlens CREATEDB;` step. This must be added before the "Run the restore drill" section. (Blocking B4.)
- **No `.env.example` entry for `PGPASSWORD`.** T19's required keys in `karbonlens.crontab` include `DATABASE_URL` but not `PGPASSWORD` as a separate key. The backup script sources `PGPASSWORD` from `/opt/karbonlens/.env` — but T19's §3 item 1 key list does not include `PGPASSWORD`. If T19's `.env` template is used as-is, `PGPASSWORD` will be absent and `pg_dump` will prompt for a password (which cron cannot provide). T20 must explicitly state that T19's `.env` template must include `PGPASSWORD=<same value as password in DATABASE_URL>`, or the backup script must extract `PGPASSWORD` from `DATABASE_URL` itself (e.g., via `python3 -c "from urllib.parse import urlparse; ..."` or `grep`). This is an integration gap between T19 and T20.
- **AC-6 two-step file check is correct** — the spec already specifies `file` on the outer gzip and `gunzip -c | file -` for the inner pg_custom format. This is the right test. However it is only valid after B2 (double-compression) is resolved; if `-Fc | gzip` is retained, the inner `file -` output will be `gzip compressed data`, not `PostgreSQL custom database dump`.

---

## CREATEDB resolution (summary)

Run as `postgres` superuser, one-time, before the first restore drill:

```sql
ALTER ROLE karbonlens CREATEDB;
```

Verify:

```bash
sudo -u postgres psql -c "\du karbonlens"
# Must show "Create DB" in the Attributes column
```

Add to `docs/runbooks/backup-and-restore.md` under "One-time setup" and to the T20 DoD checklist. Close OQ-4.
