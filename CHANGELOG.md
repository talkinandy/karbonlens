# Changelog

All notable changes to KarbonLens are recorded here. Entries are grouped by release and ordered newest-first.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). SemVer per `VERSION` once we ship v0.1.

---

## [Unreleased] — v0.1 integration branch (`feature/v0.1-impl`)

Entries land here as individual user stories (T01–T23) complete against acceptance criteria. See `docs/stories/` for the story specs and `docs/TASKS.md` for the sprint overview.

### Added
- **T01 VPS foundation** ([feature/v0.1-impl]) — provisioned the Hetzner CX32 box: PostgreSQL 16.13 + PostGIS 3.6.3, `pg_trgm` 1.6 + `pgcrypto` 1.3 extensions in the `karbonlens` database, `karbonlens` Unix user (no-login, uid 999) and Postgres role (scram-sha-256 on loopback only — wrong-password rejection verified with `FATAL: password authentication failed` exit 2). Standard directories `/opt/karbonlens` and `/var/{log,lib}/karbonlens` owned by the karbonlens user. Postgres bound to `localhost` only (`listen_addresses = 'localhost'`; no public IP exposure). Secrets at `/root/karbonlens-secrets.txt` (chmod 600, root:root). Runbook at `docs/runbooks/vps-setup.md`; implementation report at `docs/stories/reports/T01-implementation-report.md`. Code-audit verdict: PASS-WITH-FIXES (SHA 5c5bbd8).
- **T02 Schema migration 001** ([feature/T02-schema-migration]) — 15 tables (projects, registries, issuances, retirements, idx_monthly_snapshots, satellite_alerts, regulatory_events, project_scores, project_match_queue, users, accounts, sessions, verification_tokens, notifications, schema_migrations) with PostGIS geography columns, `users.email_verified` for NextAuth v5 adapter, composite PKs on `verification_tokens` and `project_scores`, generated `projects.total_vcus_available`, cascade policies per architecture §3. All 11 indexes present (2 GIST). Tables owned by `karbonlens` role so future `ALTER TABLE` migrations succeed. Migration file: `scrapers/migrations/001_init.sql`; idempotent under `--single-transaction`.
- **T03 Next.js 15 bootstrap** ([feature/T03-nextjs-bootstrap]) — scaffold Next.js 16 (App Router) at the repo root, Tailwind v4 CSS-first with tokens extracted from the legacy prototype, six screens ported with mock data under route groups `(public)` and `(app)`, `netlify.toml` wired for `@netlify/plugin-nextjs`, sole ownership of `.env.example` with eight keys mapped to consuming stories. Static prototype preserved at `legacy/prototype/`. Visual design parity not verified in a browser — follow-up needed at T11–T18. Route layouts keep `<html>` / `<body>` in root only.

### Changed

### Fixed

---
