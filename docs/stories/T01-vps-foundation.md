---
id: T01
title: Provision VPS foundation — PostGIS, DB user, directories
phase: 1
status: draft
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

**Password strategy:** Credentials are generated locally with `openssl rand -base64 24`, stored in `/root/karbonlens-secrets.txt` (mode 600), and stubbed in `.env.example` as `CHANGE_ME` placeholders. Andy wires real values into `.env.local` (local dev) and Netlify env vars (frontend) when those steps arrive in T03/T04.

---

## 3. Scope

### In scope

- Install `postgresql-16-postgis-3` and `postgresql-16-postgis-3-scripts` packages.
- Create Unix system user `karbonlens` (no shell login, home at `/home/karbonlens`).
- Create Postgres role `karbonlens` with a generated password, and database `karbonlens` owned by that role.
- Enable extensions `postgis`, `pgcrypto`, and `pg_trgm` in the `karbonlens` database.
- Verify `listen_addresses = 'localhost'` in `postgresql.conf` (default on Hetzner Ubuntu is already safe; confirm and document).
- Create the standard directory tree:
  - `/opt/karbonlens` — application and scraper code
  - `/var/log/karbonlens` — scraper log files
  - `/var/lib/karbonlens/backups` — nightly `pg_dump` archives (populated by T20)
  - `/var/lib/karbonlens/pdf-archive` — IDXCarbon PDF cache (populated by T08)
- Set all four directories to `karbonlens:karbonlens` ownership, mode `755`.
- Write generated credentials to `/root/karbonlens-secrets.txt` (mode `600`).
- Add `DATABASE_URL` placeholder to `.env.example` in the repo root.
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

**AC-4: Postgres role can authenticate and connect**

```
Given the karbonlens Postgres role and database exist
When we run (substituting the actual password from /root/karbonlens-secrets.txt):
  psql -U karbonlens -h 127.0.0.1 -d karbonlens -c "SELECT current_user, current_database();"
Then the command exits 0 and the result row shows "karbonlens | karbonlens"
```

**AC-5: Postgres listens on localhost only**

```
Given PostgreSQL 16 is running
When we run:
  sudo -u postgres psql -c "SHOW listen_addresses;"
Then the output shows "localhost" (not "*" or a public IP)
And when we run:
  ss -tlnp | grep 5432
Then port 5432 is bound only to 127.0.0.1 (not 0.0.0.0)
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
Then the line is present and contains "karbonlens" and "@127.0.0.1:5432/karbonlens"
```

**AC-8: .env.example contains DATABASE_URL placeholder**

```
Given the repo root .env.example has been updated
When we run:
  grep "DATABASE_URL" .env.example
Then the line is present and reads exactly:
  DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens
```

**AC-9: Idempotence — re-running the setup is safe**

```
Given all provisioning steps have already been run once successfully
When we run the full setup sequence a second time (using IF NOT EXISTS guards and
  "create only if missing" checks throughout)
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
| `/etc/postgresql/16/main/postgresql.conf` | config | `listen_addresses = 'localhost'` verified (no edit needed if already correct) |

### Outputs — repository files

| File | Change |
|---|---|
| `.env.example` | Add `DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens` |
| `docs/runbooks/vps-setup.md` | New file: copy-pasteable provisioning commands (see §6 for ownership) |

### Environment variables added to `.env.example`

```bash
# Database (generated password goes in /root/karbonlens-secrets.txt, NOT here)
DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens
```

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
| `.env.example` | Add `DATABASE_URL` line |
| `docs/runbooks/vps-setup.md` | Create (new file) |

No other files in the repository are touched. System-level objects (OS user, Postgres role/database, extensions, directories, secrets file) are side effects of shell commands, not tracked files.

**Parallel implementer note:** T03 (Next.js bootstrap) also touches `.env.example` to add `NEXTAUTH_*`, `GOOGLE_*`, `GFW_API_KEY`, etc. Merge conflict risk is low if each task appends its own block with a comment header. T01 must append only the `# Database` block.

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

If `ss -tlnp | grep 5432` shows `0.0.0.0:5432`, the current `listen_addresses` setting is not `localhost`. Edit `/etc/postgresql/16/main/postgresql.conf` to set `listen_addresses = 'localhost'`, then `systemctl restart postgresql`. Confirm the port is no longer exposed before proceeding. This is a security-critical check for v0.1.

**What if directories already exist with wrong ownership?**

Use `stat` to check before `chown`. If an existing directory is owned by `root` or another user, `chown -R karbonlens:karbonlens <path>` is safe — but verify there is no existing data inside that would be affected. For `/var/lib/karbonlens/backups` and `/var/lib/karbonlens/pdf-archive`, these should be empty at T01 time.

**What if `/root/karbonlens-secrets.txt` already exists?**

Do not overwrite without checking contents first. If it contains a valid connection string from a previous run, re-use the existing password rather than regenerating — changing the password here would break any already-configured `.env.local` or running process. If regeneration is forced, also update the Postgres role password: `ALTER USER karbonlens WITH PASSWORD '<new>';`.

---

## 8. Definition of done

- [ ] All nine acceptance criteria pass when verified manually.
- [ ] `docs/runbooks/vps-setup.md` is present and copy-pasteable end-to-end.
- [ ] `.env.example` contains the `DATABASE_URL` placeholder line.
- [ ] Both changed/created repo files are committed and pushed to `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T01 — VPS foundation provisioned`.
- [ ] `TASKS.md` T01 status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

1. **pg_trgm inclusion in T01 vs T02:** `docs/architecture.md` §3 mentions adding `pg_trgm` to migration 001 (T06 note says "amend and re-apply"). This story installs it at T01 time (alongside postgis/pgcrypto) to keep all extension setup in one place. Andy should confirm: is that the right boundary, or should `pg_trgm` live in the T02 migration file? The current spec installs it here to reduce the risk of T06 breaking because it forgot an extension dependency.

2. **Postgres binding and Netlify connectivity:** The v0.1 default is `localhost`-only. T04 must decide how Netlify reaches the database (Tailscale, public SSL with IP allowlist, or a proxy). This story explicitly defers that decision but calls it out so the T04 spec-writer knows it is unresolved. Andy: any preference now (e.g., "lean toward Tailscale") that the T04 spec should assume?

3. **Secrets file location:** `/root/karbonlens-secrets.txt` is readable only by root. If Andy switches to a non-root sudo user for day-to-day ops, the file should move (e.g., to `/home/<user>/karbonlens-secrets.txt` with appropriate permissions). Is root the permanent operator account for this box?

4. **Off-site backup destination (Hetzner Storage Box):** T20 references an optional Hetzner Storage Box (€4/mo) for off-site rsync. This is within the <$30/mo budget. Andy needs to confirm whether to provision the Storage Box before T20, and whether T01 should pre-create credentials or leave that entirely to T20.

5. **`pg_hba.conf` for local connections:** Ubuntu's Postgres default uses `peer` auth for local Unix socket connections (meaning `sudo -u postgres psql` works without a password) and `scram-sha-256` for TCP connections. AC-4 uses TCP (`-h 127.0.0.1`), which requires `pg_hba.conf` to have a `host` or `hostssl` entry for `karbonlens`. Verify the default config already allows this; if not, add: `host karbonlens karbonlens 127.0.0.1/32 scram-sha-256`. This detail should be in the runbook.

---

## 10. References

- PRD §5 Architecture at a glance — Hetzner CX32, PostgreSQL + PostGIS
- PRD §3 Scope — <$30/mo budget constraint, no Docker orchestration
- `docs/architecture.md` §1 System shape — localhost-only binding rationale
- `docs/architecture.md` §3 Database schema — PostGIS, pgcrypto, pg_trgm usage
- `docs/architecture.md` §4 Scraper patterns — `/opt/karbonlens`, `/var/log/karbonlens` path conventions
- `docs/architecture.md` §5.3 IDXCarbon — `/var/lib/karbonlens/pdf-archive` path
- `docs/architecture.md` §7 Environment variables — `DATABASE_URL` format
- `docs/architecture.md` §10 Operational notes — backup directory, security basics
- `docs/runbooks/vps-setup.md` — copy-pasteable implementation commands (output of this story)
