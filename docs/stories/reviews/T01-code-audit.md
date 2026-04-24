---
story: T01
auditor: code-auditor (claude-opus-4-7 [1M])
audited_commit: a75ccd5f07843beab32e299e66be28b02abb263c
verdict: PASS-WITH-FIXES
---

## Summary

T01 is functionally **correct and secure on this box**. All eight acceptance criteria verified live against the Hetzner system; most importantly, the make-or-break scram-sha-256 enforcement actually works — a wrong password produces `FATAL: password authentication failed` and exit 2 (not a silent trust-line override). The runbook §7 edit is substantive and addresses the real multi-tenant risk the earlier spec audit missed (appending to end of pg_hba.conf would have been silently defeated by the pre-existing `host all all ... trust` lines).

Two non-blocking findings: (1) the new `awk` insertion pattern is **not portable** to a clean Postgres host — if no `host all all 127.0.0.1/32 trust` line exists, awk prints the file unchanged and the karbonlens scram line is never added (simulated and confirmed); (2) host-recovery actions (killing 6-day-wedged unattended-upgrade/dpkg/redis) were outside T01 scope but necessary; all affected services (`redis-server`, `unattended-upgrades`) are active and `dpkg --audit` is clean.

No blocking findings. Recommend merge after the runbook gets a fallback-append branch for the clean-host case.

---

## Blocking findings

**None.**

---

## Non-blocking findings

### Finding 1 — Runbook awk insertion silently no-ops on a host without pre-existing `host all all <net> trust` lines

The new §7 logic:
```bash
awk -v ins="$LINE4" '
  !done && /^host[[:space:]]+all[[:space:]]+all[[:space:]]+127\.0\.0\.1\/32[[:space:]]+trust/ {
    print ins; done=1
  }
  { print }
' "$PGHBA" > "$PGHBA.tmp" && sudo mv "$PGHBA.tmp" "$PGHBA"
```

If the pattern never matches (e.g., PGDG default with `scram-sha-256` or `md5` on 127.0.0.1/32 instead of `trust`), awk prints the file unchanged and the karbonlens scram line is **never written**. Simulated against a synthetic `pg_hba.conf` that replaces `trust` with `md5` — result: 0 `karbonlens.*scram-sha-256` lines inserted. On this box the pattern matches (lines 126/129), so the bug does not manifest — but the runbook is supposed to be copy-pasteable on a fresh CX32, and the old spec-audit told the implementer to make the line "unconditional + idempotent" regardless of environment.

**Impact:** low on this host (scram lines already present and correctly ordered), but the runbook is now less portable than the spec-audit–era version. A future fresh provisioning will silently have no scram rule and fall through to whatever is below (which on PGDG default would be the project's own catch-all or peer auth — could fail-open or fail-closed depending on order).

**Recommended fix (for a follow-up, not blocking merge):** add a fallback-append path:
```bash
if ! grep -qxF "$LINE4" "$PGHBA"; then
  if grep -qE '^host[[:space:]]+all[[:space:]]+all[[:space:]]+127\.0\.0\.1/32[[:space:]]+trust' "$PGHBA"; then
    # insert before trust line (awk block as-is)
  else
    # no trust line to clobber ordering — safe to append
    echo "$LINE4" >> "$PGHBA"
  fi
fi
```
Apply symmetrically for `$LINE6`.

### Finding 2 — Extensions owned by `postgres` superuser, not `karbonlens`

Noted in the implementer's report §9 item 2. Not a T01 AC issue but worth flagging for T02: `CREATE EXTENSION ... ;` was run as `postgres`, so extension objects live in schema `public` owned by `postgres`. The `karbonlens` role can USE the functions/types (default `public` grants), but cannot drop/alter extensions. Downstream migrations must not attempt extension-level DDL as the `karbonlens` role. No action for T01.

### Finding 3 — DoD items still open (orchestrator follow-up)

Story §8 DoD requires: CHANGELOG entry under `[Unreleased]`, TASKS.md T01 status flip to `done`, story frontmatter `status: done`. None of these are done yet — CHANGELOG still shows `_(nothing landed yet; first entries follow T01+T03 implementation)_`, `TASKS.md` does not exist at repo root (there's `docs/TASKS.md`), and the T01 story frontmatter is still `audited`. Per the audit brief, T01 orchestrator handles these post-audit — not implementer's fault, just a tracking reminder.

---

## AC verification table

| AC | Command | Actual output | Result |
|---|---|---|---|
| AC-1 | `sudo -u postgres psql -d karbonlens -c "SELECT postgis_version();"` | `3.6 USE_GEOS=1 USE_PROJ=1 USE_STATS=1` | **PASS** (matches `^3\.`) |
| AC-2 | `sudo -u postgres psql -d karbonlens -c "\dx"` | postgis 3.6.3, pgcrypto 1.3, pg_trgm 1.6, plpgsql 1.0 — all in schema `public` | **PASS** |
| AC-3 | `id karbonlens` / `getent passwd karbonlens` | `uid=999(karbonlens) gid=988(karbonlens) groups=988(karbonlens)` / `karbonlens:x:999:988::/home/karbonlens:/usr/sbin/nologin` | **PASS** |
| AC-4b | `PGPASSWORD=<correct> psql -U karbonlens -h localhost -d karbonlens -c "SELECT 1;"` | row returned: `karbonlens \| karbonlens` | **PASS** |
| AC-4c (make-or-break) | `PGPASSWORD="definitely-wrong-password-xyz" psql -U karbonlens -h localhost -d karbonlens -c "SELECT 1;"` | `FATAL: password authentication failed for user "karbonlens"` — exit 2 | **PASS — scram actually enforced** |
| AC-4d (ordering) | `grep -n . /etc/postgresql/16/main/pg_hba.conf \| grep -v '^[0-9]*:#'` | line 125 scram IPv4 **before** line 126 trust IPv4; line 128 scram IPv6 **before** line 129 trust IPv6 | **PASS** |
| AC-5a | `sudo ss -tlnp \| grep 5432` | `127.0.0.1:5432` + `[::1]:5432` only — no 0.0.0.0, no public IP | **PASS** |
| AC-5b | `grep ^listen_addresses /etc/postgresql/16/main/postgresql.conf` | `listen_addresses = 'localhost'` (uncommented, explicit) | **PASS** |
| AC-6 | `stat -c "%U:%G %a %n" /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens/backups /var/lib/karbonlens/pdf-archive` | all four: `karbonlens:karbonlens 755` | **PASS** |
| AC-7 | `stat -c '%A %U:%G %n' /root/karbonlens-secrets.txt` | `-rw------- root:root /root/karbonlens-secrets.txt` | **PASS** |
| AC-8 | Guard audit across runbook (see below) | every `useradd`/`createdb`/`CREATE EXTENSION`/`install -d`/pg_hba append step is guarded; extensions use `IF NOT EXISTS`, user via `id … && echo skip`, role via `SELECT 1 FROM pg_roles`, DB via `SELECT 1 FROM pg_database`, hba via `grep -qxF`, secrets via `[ ! -f ]`, listen_addresses via `grep -qE` | **PASS** |

**Wrong-password rejection — the critical test — WORKS. Scram-sha-256 is genuinely in effect, not shadowed by a trust line.**

---

## Runbook-edit review

### What changed in §7 (between `c26af69` and `a75ccd5`)

- **Before:** `grep -qxF ... || echo "$LINE" | tee -a "$PGHBA"` — appended to EOF.
- **After:** `awk` inserts the karbonlens scram lines immediately before the first `host all all <net> trust` match, then `sed -i /.../d` defensively removes any pre-existing `host karbonlens karbonlens ... trust` lines, then reloads Postgres.
- **Added:** bonus smoke test at end of §7 — `PGPASSWORD="wrong-password-test" psql ...` expected FATAL.
- **Added:** verification `grep -nE "karbonlens|^host" "$PGHBA"` so the operator can eyeball ordering.

### Why the edit was necessary

The multi-tenant default `pg_hba.conf` on this box already contained `host all all 127.0.0.1/32 trust` (line 126) and `host all all ::1/128 trust` (line 129) from paperclip/secretaryai local dev. pg_hba.conf is first-match-wins. An append-at-EOF strategy would have placed karbonlens scram lines below the catch-all trust — meaning `grep "karbonlens.*scram-sha-256"` would succeed (line exists in file), but the auth method *actually in effect* for a connecting client would still be `trust`. The earlier spec audit's `|| echo >> pg_hba.conf` recommendation was correct in prose but wrong in execution on this host.

### Is the new pattern safe to re-run?

- **On this host:** YES. `grep -qxF "$LINE4"` gate prevents duplicate insertions; awk's `!done` flag means only first match is acted on. Re-ran mentally against the current file — no-op.
- **On a clean host without a `host all all 127.0.0.1/32 trust` line:** **NO — silently no-ops** (see Finding 1 above). awk falls through without matching; the scram line never lands. This is the one material regression vs. the old append-based pattern (which would always add the line, just in the wrong place).

### Wrong-password smoke test added to runbook?

Yes — lines 177-178 of `docs/runbooks/vps-setup.md`. Confirmed present and the expected FATAL is documented inline.

---

## Host-recovery review

Implementer killed wedged processes outside T01 scope to unblock apt. Verified aftermath:

| Check | Expected | Actual | Status |
|---|---|---|---|
| `systemctl is-active redis-server` | active | `active` | OK — redis came back clean |
| `systemctl is-active unattended-upgrades` | active | `active` | OK — daemon re-enabled |
| `dpkg --audit` | empty | empty | OK — no broken package state |
| `systemctl is-active postgresql@16-main` | active | (implicit in AC-1/2/4/5 success) | OK |
| paperclip/pm2-root restart side effect | noted | flagged in report §3 item 4 | documented |

No regressions for other tenants detected during the audit window. Redis data was already lost *before* implementer's kill (6 days stuck in `deactivating (stop-sigterm)` with `Error trying to save the DB`), so the kill was strictly recovery, not destruction. Acceptable — **no tenant-regression finding**.

---

## Security pass

| Check | Actual | Status |
|---|---|---|
| `/root/karbonlens-secrets.txt` readable only by root | `-rw------- root:root` | **OK** |
| Any `host all all 0.0.0.0/0 trust` or similar public rule | `grep -E "0\.0\.0\.0\|/0" pg_hba.conf` → no public rules | **OK** |
| `listen_addresses` = localhost (no `*` or public IP) | explicit `= 'localhost'` | **OK** |
| `ss -tlnp \| grep 5432` bound only to loopback | `127.0.0.1:5432` + `[::1]:5432` | **OK** |
| `karbonlens` role — LOGIN only, no SUPERUSER, CREATEDB, CREATEROLE | `rolsuper=f rolcreatedb=f rolcreaterole=f rolcanlogin=t` | **OK** |
| `scram-sha-256` actually enforced (not trust-shadowed) | Wrong password → FATAL (exit 2) | **OK — critical** |
| `host karbonlens karbonlens ... trust` entries (defensive removal worked) | None present | **OK** |

No security regressions.

---

## Spec-compliance check

### §6 file-ownership map: implementer should only have touched `docs/runbooks/vps-setup.md` + produced the report

`git show HEAD --stat`:
```
 docs/runbooks/vps-setup.md                        |  46 +++-
 docs/stories/reports/T01-implementation-report.md | 249 ++++++++++++++++++++++
 2 files changed, 285 insertions(+), 10 deletions(-)
```

Exactly the two files allowed by the story §6 file-ownership table + the implementation-report convention. **No spec violation.**

### §3 out-of-scope items

Checked — none of the following were touched:
- No schema DDL or `CREATE TABLE` (T02 territory) — DB is empty of user tables; only the three enabled extensions are present.
- No `.env.example` modifications (T03 territory) — runbook §10 explicitly tells the operator "T01 does not touch `.env.example`".
- No Drizzle config, no backup cron, no firewall rules, no TimescaleDB, no scraper scaffolding.
- No architecture.md edits.

### §8 DoD checklist state

- [x] Eight ACs pass (verified in this audit)
- [x] `docs/runbooks/vps-setup.md` present and copy-pasteable (with Finding 1 caveat on clean hosts)
- [x] `pg_hba.conf` contains scram-sha-256 for 127.0.0.1/32 AND ::1/128; no trust entry covers the karbonlens role specifically
- [x] `listen_addresses = 'localhost'` explicitly set in `postgresql.conf`
- [ ] Repo file committed and pushed to `feature/v0.1-impl` — committed locally at `a75ccd5`, not pushed (per brief)
- [ ] CHANGELOG entry under `[Unreleased]` — **MISSING** (for orchestrator)
- [ ] `TASKS.md` T01 status → `done` — **MISSING** (for orchestrator; note: file is `docs/TASKS.md`, not root `TASKS.md`)
- [ ] Story frontmatter `status: done` — still `audited` (for orchestrator)

The last three DoD items are the orchestrator's responsibility per the audit brief ("do not commit, do not merge"), so they are flagged as reminders, not audit failures.

---

## Merge recommendation

**Recommend merge** after the orchestrator applies the three DoD tracking updates (CHANGELOG entry, story frontmatter flip, TASKS.md update).

Finding 1 (awk clean-host portability) should be addressed in a follow-up runbook edit but does not block T01 sign-off — on the actual target host this commit provisions, every AC passes and scram-sha-256 is verifiably enforced. T02 can safely proceed against the current DB state.
