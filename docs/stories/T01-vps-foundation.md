---
id: T01
title: Provision VPS foundation — PostGIS, DB user, directories
phase: 1
status: audited
blocked_by: []
blocks: [T02, T20]
owner: implementer
effort_estimate: 2h
---

## 1. User story

As the solo founder running KarbonLens on a Hetzner CX32 VPS, I want a correctly provisioned local PostgreSQL 16 instance with PostGIS, a dedicated OS user, and the standard directory tree, so that every downstream task (schema migration, scrapers, backups) has a stable, idempotent foundation to build on.

---

## 2. Context & rationale

KarbonLens uses PostgreSQL 16 + PostGIS for all spatial project data (centroids, alert intersection, future polygons). The database and scrapers live on the same Hetzner CX32 box as a deliberate v0.1 simplification — no Docker orchestration, no separate backend service.

**Why local provisioning, not remote SSH:** This story runs as local shell commands on the Hetzner box itself. There is no `ssh <vps>` hop; the VPS is the working machine. Andy or Claude Code executes commands in a local terminal session (or an existing SSH session already established to the box).

**Why PostGIS now:** The `projects` table stores `GEOGRAPHY(POINT, 4326)` centroids and alert intersection uses `ST_DWithin`. PostGIS must be installed before the schema migration (T02) can run.

**Why `pgcrypto`:** `gen_random_uuid()` is the primary key strategy for all tables. `pgcrypto` must be present in the target database for T02's DDL to succeed.

**Binding decision (v0.1):** PostgreSQL listens on `localhost` only. Netlify cannot reach a localhost-only Postgres directly — that problem is deferred to T04, which will decide between Tailscale, a small proxy, or selective public exposure. Callers of this story must not open port 5432 on the public interface.

**Password strategy:** Credentials are generated locally with `openssl rand -base64 24` and stored in `/root/karbonlens-secrets.txt` (mode 600). Andy copies the real `DATABASE_URL` into `.env.local` (local dev, gitignored) and Netlify env vars (frontend) when those steps arrive in T03/T04. T01 does not write to `.env.example` — T03 owns that file.

---

## 3. Scope

### In scope

- Install `postgresql-16-postgis-3` and `postgresql-16-postgis-3-scripts` packages.
- Create Unix system user `karbonlens` (no shell login, home at `/home/karbonlens`).
- Create Postgres role `karbonlens` with a generated password, and database `karbonlens` owned by that role.
- Enable extensions `postgis`, `pgcrypto`, and `pg_trgm` in the `karbonlens` database.
- Explicitly set `listen_addresses = 'localhost'` in `postgresql.conf` and verify the effective value. Do not rely on the compiled-in default; make the setting explicit so future configuration tooling cannot silently revert it.
- Create the standard directory tree:
  - `/opt/karbonlens` — application and scraper code
  - `/var/log/karbonlens` — scraper log files
  - `/var/lib/karbonlens/backups` — nightly `pg_dump` archives (populated by T20)
  - `/var/lib/karbonlens/pdf-archive` — IDXCarbon PDF cache (populated by T08)
- Set all four directories to `karbonlens:karbonlens` ownership, mode `755`.
- Write generated credentials to `/root/karbonlens-secrets.txt` (mode `600`). T03 owns `.env.example` entirely — do not touch it.
- Produce `docs/runbooks/vps-setup.md` with copy-pasteable commands.
- All setup steps must be idempotent (safe to re-run).

### Out of scope (explicit non-goals)

- Schema DDL (CREATE TABLE, indexes, etc.) — that is T02.
- Drizzle ORM configuration — T04.
- Backup cron job — T20.
- Public Postgres exposure, Tailscale, Netlify connectivity — T04 or later.
- TimescaleDB extension — deferred to v0.2 per PRD §5.
- Any application code, Python venv, or scraper scaffolding — T06+.
- Firewall rules beyond confirming localhost-only binding.
- SSL certificate generation for Postgres — T04 handles this if public exposure is chosen.
- Logrotate configuration — T19.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: PostGIS installed and version ≥ 3**

```
Given PostgreSQL 16 is running on localhost
When we run:
  sudo -u postgres psql -d karbonlens -c "SELECT postgis_version();"
Then the command exits 0 and the returned version string matches the pattern ^3\.
```

**AC-2: pgcrypto and pg_trgm extensions present**

```
Given the karbonlens database exists
When we run:
  sudo -u postgres psql -d karbonlens -c "\dx"
Then the output contains both "pgcrypto" and "pg_trgm" in the Name column
```

**AC-3: Unix user karbonlens exists with no-login shell**

```
Given the provisioning commands have been run
When we run:
  id karbonlens
Then the command exits 0 and the output contains "karbonlens"
And when we run:
  getent passwd karbonlens | cut -d: -f7
Then the output is /usr/sbin/nologin
```

**AC-4: Postgres role can authenticate and connect via scram-sha-256**

```
Given the karbonlens Postgres role and database exist
When we run (substituting the actual password from /root/karbonlens-secrets.txt):
  psql -U karbonlens -h 127.0.0.1 -d karbonlens -c "SELECT current_user, current_database();"
Then the command exits 0 and the result row shows "karbonlens | karbonlens"
And when we run:
  grep "karbonlens.*scram-sha-256" /etc/postgresql/16/main/pg_hba.conf
Then the line is present (confirming scram-sha-256 password auth — not trust — is in effect)
```

**AC-5: Postgres listens on localhost only**

```
Given PostgreSQL 16 is running
When we run:
  sudo -u postgres psql -c "SHOW listen_addresses;"
Then the output shows "localhost" (not "*" or a public IP)
And when we run:
  ss -tlnp | grep 5432
Then port 5432 is bound only to loopback addresses (127.0.0.1 and/or ::1) — not 0.0.0.0 or any public IP
```

**AC-6: Directory tree exists with correct ownership**

```
Given the provisioning commands have been run
When we run:
  stat -c "%U:%G %a %n" /opt/karbonlens /var/log/karbonlens \
    /var/lib/karbonlens/backups /var/lib/karbonlens/pdf-archive
Then every line shows "karbonlens:karbonlens 755 <path>"
```

**AC-7: Credentials file is owner-only readable**

```
Given /root/karbonlens-secrets.txt has been written
When we run:
  stat -c "%a %U" /root/karbonlens-secrets.txt
Then the output is "600 root"
And when we run:
  grep "DATABASE_URL" /root/karbonlens-secrets.txt
Then the line is present and contains "karbonlens" and "@localhost:5432/karbonlens"
```

**AC-8: Idempotence — re-running the setup is safe**

```
Given all provisioning steps have already been run once successfully
When we re-run runbook sections 2–8 (skip section 1 apt install if packages already present):
  bash -e /opt/karbonlens/runbook-setup.sh 2>&1 | grep -cE "^(ERROR|FATAL)" ; echo "exit: $?"
Then no command exits non-zero
And no new duplicate OS users, Postgres roles, databases, or directories are created
And the existing karbonlens database and its contents are untouched
```

---

## 5. Inputs & outputs

### Inputs

- A running Hetzner CX32 with Ubuntu LTS and PostgreSQL 16 already installed (no PostGIS yet).
- Root (or passwordless sudo) access to the local shell.
- Internet access from the VPS for `apt` package installation.

### Outputs — system state

| Object | Type | Description |
|---|---|---|
| `postgresql-16-postgis-3` | apt package | PostGIS binaries |
| `postgresql-16-postgis-3-scripts` | apt package | PostGIS SQL scripts |
| `karbonlens` Unix user | OS user | System user, no shell, home `/home/karbonlens` |
| `karbonlens` Postgres role | DB role | Owns the `karbonlens` database |
| `karbonlens` Postgres database | DB | All v0.1 data lives here |
| `postgis` extension | DB extension | Spatial types and functions |
| `pgcrypto` extension | DB extension | `gen_random_uuid()` support |
| `pg_trgm` extension | DB extension | Fuzzy name matching for entity resolution (T06) |
| `/opt/karbonlens` | directory | App root; scrapers deployed here |
| `/var/log/karbonlens` | directory | Scraper log output (populated by T19) |
| `/var/lib/karbonlens/backups` | directory | `pg_dump` output (populated by T20) |
| `/var/lib/karbonlens/pdf-archive` | directory | IDXCarbon PDFs (populated by T08) |
| `/root/karbonlens-secrets.txt` | file, mode 600 | Generated DB password + connection string |
| `/etc/postgresql/16/main/postgresql.conf` | config | `listen_addresses = 'localhost'` explicitly set and verified |
| `/etc/postgresql/16/main/pg_hba.conf` | config | `host karbonlens karbonlens 127.0.0.1/32 scram-sha-256` and `::1/128` lines present; `trust` auth removed for karbonlens role |

### Outputs — repository files

| File | Change |
|---|---|
| `docs/runbooks/vps-setup.md` | New file: copy-pasteable provisioning commands (see §6 for ownership) |

T01 does **not** touch `.env.example` — that file is owned by T03.

---

## 6. Dependencies & interactions

### Blocked by

None. T01 is the first task and has no upstream dependencies.

### Blocks

- **T02** (Schema migration 001) — requires the `karbonlens` database and all three extensions to exist.
- **T20** (Backups cron) — requires `/var/lib/karbonlens/backups` directory with correct ownership.

### File ownership

This story is exclusively responsible for creating and modifying:

| Path | Action |
|---|---|
| `docs/runbooks/vps-setup.md` | Create (new file) |

No other files in the repository are touched. System-level objects (OS user, Postgres role/database, extensions, directories, secrets file) are side effects of shell commands, not tracked files.

**`.env.example` boundary:** T03 (Next.js bootstrap) owns `.env.example` entirely. T01 does not add any line to it. The real `DATABASE_URL` lives in `/root/karbonlens-secrets.txt` on the VPS; T03's `DATABASE_URL=CHANGE_ME` placeholder is what ends up in `.env.example`.

---

## 7. Edge cases & failure modes

**What if Postgres is not version 16?**

Check with `psql --version` before starting. If Postgres 15 or earlier is installed, do not proceed — upgrade or re-provision Postgres 16 first. The architecture explicitly requires PG16. Document the version found in the runbook for auditability.

**What if the `karbonlens` Unix user already exists?**

Use `id karbonlens` to check before running `useradd`. If the user exists, skip creation and verify the shell is `/usr/sbin/nologin`. If it was created differently (e.g., with a login shell), correct with `usermod -s /usr/sbin/nologin karbonlens`. Log the discrepancy.

**What if the `karbonlens` Postgres role already exists?**

Use `\du` or `SELECT rolname FROM pg_roles WHERE rolname='karbonlens';` to check. If it exists, skip `CREATE USER`. Do not attempt to recreate or reset the password automatically — the existing password may already be in use by a running process. Verify connectivity with `psql -U karbonlens -h 127.0.0.1 -d karbonlens -c "SELECT 1;"`.

**What if the `karbonlens` database already exists?**

Check with `\l` in psql. If it exists, verify ownership with `\l karbonlens`. If owned by the wrong role, investigate before changing anything — there may already be data present. Do not drop and recreate.

**What if PostGIS installation fails?**

`apt install postgresql-16-postgis-3` may fail if `apt` sources are outdated or the package is unavailable. Run `apt update` first. If PostGIS 3 is not available for the installed Postgres version, check that the Ubuntu release matches an official PGDG repository that ships PG16 + PostGIS 3 together. Do not install PostGIS 2 as a fallback — the schema requires PostGIS 3 (`GEOGRAPHY` type behavior changed in v3).

**What if port 5432 is already bound to a public interface?**

If `ss -tlnp | grep 5432` shows `0.0.0.0:5432`, the current `listen_addresses` setting is not `localhost`. The runbook step 6 sets it explicitly via `sed`; after applying that step, run `systemctl restart postgresql` and confirm `0.0.0.0:5432` is gone. This is a security-critical check for v0.1.

**Expected `ss` output with `listen_addresses = 'localhost'`:** On Linux, `localhost` resolves to both IPv4 and IPv6 loopback, so `ss -tlnp | grep 5432` will typically show two entries: `127.0.0.1:5432` and `[::1]:5432`. Both are expected and safe. Seeing `[::1]:5432` is not a misconfiguration — do not attempt to suppress it.

**What if directories already exist with wrong ownership?**

Use `stat` to check before `chown`. If an existing directory is owned by `root` or another user, `chown -R karbonlens:karbonlens <path>` is safe — but verify there is no existing data inside that would be affected. For `/var/lib/karbonlens/backups` and `/var/lib/karbonlens/pdf-archive`, these should be empty at T01 time.

**What if `/root/karbonlens-secrets.txt` already exists?**

Do not overwrite without checking contents first. If it contains a valid connection string from a previous run, re-use the existing password rather than regenerating — changing the password here would break any already-configured `.env.local` or running process. If regeneration is forced, also update the Postgres role password: `ALTER USER karbonlens WITH PASSWORD '<new>';`.

---

## 8. Definition of done

- [ ] All eight acceptance criteria pass when verified manually.
- [ ] `docs/runbooks/vps-setup.md` is present and copy-pasteable end-to-end.
- [ ] `pg_hba.conf` contains the `scram-sha-256` lines for both 127.0.0.1/32 and ::1/128; no `trust` entry covers the karbonlens role.
- [ ] `listen_addresses = 'localhost'` is explicitly set (not commented out) in `postgresql.conf`.
- [ ] The repo file `docs/runbooks/vps-setup.md` is committed and pushed to `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T01 — VPS foundation provisioned`.
- [ ] `TASKS.md` T01 status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

1. ~~**pg_trgm OS package:**~~ **CLOSED.** Confirmed: `pg_trgm` ships with the core `postgresql-16` package on PGDG Ubuntu builds. No `postgresql-contrib` package is required. `CREATE EXTENSION pg_trgm` succeeds after a bare `postgresql-16` install.

2. **Postgres binding and Netlify connectivity:** The v0.1 default is `localhost`-only. T04 must decide how Netlify reaches the database (Tailscale, public SSL with IP allowlist, or a proxy). This story explicitly defers that decision but calls it out so the T04 spec-writer knows it is unresolved. Andy: any preference now (e.g., "lean toward Tailscale") that the T04 spec should assume?

3. ~~**Secrets file location:**~~ **CLOSED.** Root is the operator account for v0.1. The `/root/karbonlens-secrets.txt` location is accepted. Revisit when a non-root operator account is introduced in v0.2 ops hardening.

4. **Off-site backup destination (Hetzner Storage Box):** T20 references an optional Hetzner Storage Box (€4/mo) for off-site rsync. This is within the <$30/mo budget. Andy needs to confirm whether to provision the Storage Box before T20, and whether T01 should pre-create credentials or leave that entirely to T20.

5. ~~**`pg_hba.conf` for local connections:**~~ **CLOSED.** The runbook now unconditionally adds `scram-sha-256` entries for both 127.0.0.1/32 and ::1/128, placed before any `trust` line for the karbonlens role, and reloads Postgres. The `postgres` superuser's `peer` auth on Unix socket is not affected. AC-4 verifies the `scram-sha-256` line is present.

---

## 10. Rollback notes

If provisioning is partially botched and must be torn down, run these commands manually (order matters):

```bash
# 1. Drop database (destroys all data — confirm nothing important is in there)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS karbonlens;"

# 2. Drop role
sudo -u postgres psql -c "DROP ROLE IF EXISTS karbonlens;"

# 3. Remove Unix user and home directory
userdel -r karbonlens 2>/dev/null; true

# 4. Remove application directories
rm -rf /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens

# 5. Remove secrets file
rm -f /root/karbonlens-secrets.txt

# 6. Revert postgresql.conf if you edited listen_addresses
#    (Uncomment or delete the listen_addresses line; restart postgres)
# sudo systemctl restart postgresql

# 7. Remove pg_hba.conf lines for karbonlens, then reload
#    sudo sed -i '/karbonlens.*scram-sha-256/d' /etc/postgresql/16/main/pg_hba.conf
#    sudo systemctl reload postgresql
```

This is a manual teardown guide, not an automated script. Verify with `id karbonlens`, `\du`, and `\l` in psql after running.

---

## 11. References

- PRD §5 Architecture at a glance — Hetzner CX32, PostgreSQL + PostGIS
- PRD §3 Scope — <$30/mo budget constraint, no Docker orchestration
- `docs/architecture.md` §1 System shape — localhost-only binding rationale
- `docs/architecture.md` §3 Database schema — PostGIS, pgcrypto, pg_trgm usage
- `docs/architecture.md` §4 Scraper patterns — `/opt/karbonlens`, `/var/log/karbonlens` path conventions
- `docs/architecture.md` §5.3 IDXCarbon — `/var/lib/karbonlens/pdf-archive` path
- `docs/architecture.md` §7 Environment variables — `DATABASE_URL` format
- `docs/architecture.md` §10 Operational notes — backup directory, security basics
- `docs/runbooks/vps-setup.md` — copy-pasteable implementation commands (output of this story)
