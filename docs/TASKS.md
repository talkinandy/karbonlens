# KarbonLens — Tasks playbook

**Audience:** Andy + Claude Code.
**Purpose:** Ordered, executable tasks to ship v0.1 by end of May 2026.
**Companion to:** `PRD.md` (why), `docs/architecture.md` (how).

**How to use this file with Claude Code:**
1. Read `PRD.md` and `docs/architecture.md` first (always).
2. Pick the first task whose `Blocked by:` is empty or done.
3. Paste the task block starting at `### T0X` and ending before the next `### T0X` as the prompt.
4. Review the output against the `Acceptance:` criteria before marking done.
5. Update `Status:` to `done` and move to the next task.

Tasks are numbered for referencing, not for strict ordering. Parallel tasks are noted.

**Status legend:** `todo` · `in-progress` · `done` · `blocked` · `skipped`

---

## Sprint overview

| # | Task | Blocked by | Effort | Status |
|---|---|---|---|---|
| T01 | VPS foundation: PostGIS, users, backups | — | 2h | done |
| T02 | Schema migration 001 (initial) | T01 | 1h | done |
| T03 | Next.js monorepo bootstrap + Netlify deploy | — | 3h | done |
| T04 | Drizzle schema + DB client + env plumbing | T02, T03 | 2h | done |
| T05 | NextAuth.js with Google OAuth | T04 | 2h | done |
| T06 | Verra scraper: fetch + parse + upsert | T02 | 6h | done |
| T06.1 | Status normalization (follow-up) | T06 | 1h | done |
| T07 | GFW alerts scraper: geostore + query + upsert | T02, T06 | 4h | done |
| T08 | IDXCarbon monthly PDF scraper | T02 | 4h | done — 10 months; IDXCarbon source caps AC-2 |
| T09 | Score computation daily job | T06, T07 | 2h | done |
| T10 | Seed regulatory events manually | T02 | 1h | done — fact-checked 2026-04-21; 2 unverified rows removed, 3 corrected; 8 events total |
| T11 | Projects explorer screen (table + filters) | T04, T06 | 4h | done |
| T12 | Project detail screen | T04, T06, T07, T09 | 4h | done |
| T13 | Map integration on projects + detail | T11, T12 | 6h | done |
| T14 | Price intelligence screen | T04, T08 | 3h | done |
| T15 | Regulatory timeline screen | T04, T10 | 2h | done |
| T16 | Notifications bell + alerts inbox | T04, T05, T07 | 3h | done |
| T17 | Weekly digest email via Resend | T16 | 3h | done (phase A) — Phase B (live Resend send) pending Andy's RESEND_API_KEY |
| T18 | Landing page with live stats | T11, T14 | 2h | todo |
| T19 | Cron installation on VPS | T06, T07, T08, T09, T17 | 1h | todo |
| T20 | Backups + pg_dump cron | T01 | 1h | todo |
| T21 | Entity resolution review admin page | T06 | 3h | todo |
| T22 | Sentry error tracking | T03 | 1h | todo |
| T23 | Replace static prototype with live Next.js build | T11, T12, T14, T15, T16, T18 | 2h | todo |

**Total estimated effort:** ~62 hours of focused engineering. Aim for 4–6h/day → roughly 2 weeks calendar, leaves 3+ weeks buffer before end-of-May target.

> **Phase 1 + 2 complete as of 2026-04-21.** T01–T05 fully done (T05 Phase B live-verified 2026-04-21). T06–T10 done with three deferred items: T07 Phase B (pending Andy's GFW_API_KEY — populates satellite_alerts + unblocks T09 AC-5 re-verify); T10 rows 6–10 fact-check (pending Andy). Ready for Phase 3.

---

## Phase 1 — Foundation (T01–T05)

Everything downstream depends on this. Do these in order.

### T01 — VPS foundation: PostGIS, users, backups dir

**Goal:** Prepare the Hetzner CX32 VPS for Claude Code to land code on. Postgres is already installed; we need extensions, a scraper user, and standard directories.

**Blocked by:** — (run now)

**Context:** Hetzner CX32, Ubuntu LTS, Postgres 16 already installed. SSH access available. No PostGIS, no TimescaleDB yet. Andy runs commands remotely.

**Do this:**

1. SSH to the VPS as root (or sudo user).
2. Install PostGIS:
   ```bash
   apt update
   apt install -y postgresql-16-postgis-3 postgresql-16-postgis-3-scripts
   ```
3. Create a Unix user `karbonlens` (no shell login, for running scrapers):
   ```bash
   useradd -r -s /usr/sbin/nologin -m -d /home/karbonlens karbonlens
   ```
4. Create the Postgres database and DB user:
   ```bash
   sudo -u postgres psql <<SQL
   CREATE USER karbonlens WITH PASSWORD '<generate-strong-password>';
   CREATE DATABASE karbonlens OWNER karbonlens;
   \c karbonlens
   CREATE EXTENSION postgis;
   CREATE EXTENSION pgcrypto;
   SQL
   ```
5. Create standard directories:
   ```bash
   mkdir -p /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens/{backups,pdf-archive}
   chown -R karbonlens:karbonlens /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens
   ```
6. Configure Postgres to listen only on localhost (default is safe on Hetzner but verify):
   - In `/etc/postgresql/16/main/postgresql.conf`: `listen_addresses = 'localhost'`
   - Restart: `systemctl restart postgresql`
7. Save the DB password securely; it goes into Netlify env vars (step T03/T04) and VPS `.env` (step T19).

**Acceptance:**
- [ ] `sudo -u postgres psql -d karbonlens -c "SELECT postgis_version();"` returns a version string
- [ ] `id karbonlens` shows the user exists
- [ ] `ls -la /opt/karbonlens /var/log/karbonlens /var/lib/karbonlens/backups` shows karbonlens ownership
- [ ] `psql -U karbonlens -h localhost -d karbonlens -c "SELECT 1;"` succeeds with the new password

**Notes:**
- Skip TimescaleDB for v0.1 (per PRD).
- Don't expose Postgres on public interface yet; Netlify will connect via a tunnel in T04.

---

### T02 — Schema migration 001: initial tables

**Goal:** Create all v0.1 tables in the karbonlens database.

**Blocked by:** T01

**Context:** The canonical schema lives in `docs/architecture.md` Section 3. That section is the source of truth; this task applies it.

**Do this:**

1. In the repo, create `scrapers/migrations/001_init.sql` containing the full schema from `docs/architecture.md` Section 3 (projects, registries, issuances, retirements, idx_monthly_snapshots, satellite_alerts, regulatory_events, project_scores, project_match_queue, users, accounts, sessions, verification_tokens, notifications).
2. Ensure every `CREATE TABLE` has `IF NOT EXISTS`, every `CREATE INDEX` has `IF NOT EXISTS`, every `CREATE EXTENSION` has `IF NOT EXISTS`.
3. Add a trailing line: `INSERT INTO schema_migrations (version) VALUES ('001') ON CONFLICT DO NOTHING;` (create `schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT NOW())` at the top if not exists).
4. On the VPS, copy the file and apply:
   ```bash
   scp scrapers/migrations/001_init.sql karbonlens@<vps>:/opt/karbonlens/migrations/
   ssh <vps> "sudo -u postgres psql -d karbonlens -f /opt/karbonlens/migrations/001_init.sql"
   ```
5. Commit the migration to the repo.

**Acceptance:**
- [ ] `psql -U karbonlens -d karbonlens -c "\dt"` lists all 14 expected tables
- [ ] `psql -U karbonlens -d karbonlens -c "\di"` lists all indexes
- [ ] Re-running the migration is idempotent (no errors on second run)
- [ ] `schema_migrations` table has row with version='001'

---

### T03 — Next.js monorepo bootstrap + Netlify deploy

**Goal:** Replace the static prototype at karbonlens.netlify.app with a Next.js 15 app that renders the same screens (still with mock data for now). Wire up to Netlify with environment variables.

**Blocked by:** — (parallel to T01)

**Context:** The existing karbonlens.netlify.app runs a static HTML prototype. We're rebuilding in Next.js 15 App Router. The visual design is locked in `KarbonLens_Design_Brief.md` and `KarbonLens_Design_Brief_Maps_Addendum.md`. Follow those tokens exactly.

**Do this:**

1. In the karbonlens repo root, scaffold Next.js 15:
   ```bash
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --turbopack
   ```
2. Install core dependencies:
   ```bash
   npm i drizzle-orm postgres next-auth@beta @auth/drizzle-adapter
   npm i -D drizzle-kit @types/node
   ```
3. Set up Tailwind v4 with the design tokens from the design brief — copy all CSS custom properties into `app/globals.css` under `:root`.
4. Create the folder layout from `docs/architecture.md` Section 2 (`app/(public)`, `app/(app)`, `app/api`, `lib/`, `components/ui/`, `components/map/`).
5. Port the 6 screens from the existing karbonlens-prototype.html as Next.js pages. Use mock data inline for now — real data comes in T11 onwards. Each screen should match the design brief specs exactly.
6. Configure Netlify:
   - Ensure `netlify.toml` in root: `[build]` publish `.next`, command `npm run build`
   - Push to `main` branch
   - Verify auto-deploy works
7. Add `.env.example` with all variables from `docs/architecture.md` Section 7 (commented but present).

**Acceptance:**
- [ ] `npm run dev` runs locally at localhost:3000
- [ ] All 6 screens render at expected routes (/, /projects, /projects/katingan-peatland, /prices, /regulatory, /alerts)
- [ ] Design matches the brief: sentence case, tabular numerals, no gradients/shadows, correct colors
- [ ] Pushing to `main` deploys to karbonlens.netlify.app within 3 minutes
- [ ] `.env.example` is committed, `.env.local` is gitignored

**Notes:**
- Don't wire up real data yet — that's T11+.
- Don't worry about auth yet — that's T05.
- Keep the static HTML prototype somewhere (gist or backup folder) in case we need to reference it.

---

### T04 — Drizzle schema + DB client + env plumbing

**Goal:** TypeScript can query the Postgres DB from Next.js server components and API routes. DB connection works locally and from Netlify.

**Blocked by:** T02, T03

**Context:** Using Drizzle ORM because it's TypeScript-native and lets us drop to raw SQL when needed. Connecting from Netlify to Hetzner Postgres needs either Tailscale or public Postgres (carefully secured).

**Do this:**

1. In `lib/schema.ts`, write Drizzle table definitions mirroring `docs/architecture.md` Section 3. Use `drizzle-kit introspect` to generate initial boilerplate, then clean up.
2. In `lib/db.ts`, export a singleton Drizzle client:
   ```typescript
   import { drizzle } from 'drizzle-orm/postgres-js';
   import postgres from 'postgres';
   import * as schema from './schema';
   
   const connectionString = process.env.DATABASE_URL!;
   const client = postgres(connectionString, { max: 10 });
   export const db = drizzle(client, { schema });
   ```
3. Decide Postgres exposure strategy:
   - **Preferred:** Tailscale on VPS + Netlify build environment cannot use Tailscale → fallback required.
   - **Pragmatic v0.1:** expose Postgres on public IP with strict `pg_hba.conf` (only Netlify IP ranges) and SSL required. Generate server cert.
   - **Better v0.2:** Netlify Edge Functions proxy to a self-hosted API on the VPS with Tailscale.
   - Pick pragmatic. Document the tradeoff in `docs/architecture.md` under Operational Notes.
4. Configure Postgres to accept SSL connections from Netlify's IP range:
   - Edit `/etc/postgresql/16/main/postgresql.conf`: `listen_addresses = '*'`, `ssl = on`
   - Edit `pg_hba.conf`: add `hostssl karbonlens karbonlens 0.0.0.0/0 scram-sha-256` (restrictive but open; tighten to Netlify ranges later)
   - Generate self-signed SSL cert for Postgres
   - Restart Postgres
   - Open firewall port 5432 only from Netlify outbound IP ranges (check Netlify docs for current list)
5. Test from local:
   ```bash
   DATABASE_URL="postgresql://karbonlens:xxx@<vps-ip>:5432/karbonlens?sslmode=require" npm run dev
   ```
6. Add `DATABASE_URL` to Netlify environment variables for production deploys.
7. Write a trivial API route `app/api/health/route.ts` that does `SELECT 1` against Drizzle and returns `{ok: true, db: 'connected'}`.

**Acceptance:**
- [ ] `curl https://karbonlens.netlify.app/api/health` returns `{ok: true, db: 'connected'}`
- [ ] Local dev can query the DB
- [ ] Drizzle schema compiles without type errors
- [ ] `pg_hba.conf` restricts by IP where possible

**Notes:**
- If public-facing Postgres gives security-heebie-jeebies, punt to Tailscale + a tiny Node API proxy on the VPS, then Netlify calls the proxy. Either works for v0.1. Pragmatic wins.
- Password in the `DATABASE_URL` must be URL-encoded if it has special characters.

---

### T05 — NextAuth.js with Google OAuth

**Goal:** Users can sign in with Google. Sessions persist in Postgres. Authenticated routes are protected.

**Blocked by:** T04

**Context:** NextAuth v5 (Auth.js), `@auth/drizzle-adapter`. Users table and session tables already exist from T02.

**Do this:**

1. Create a Google Cloud project at console.cloud.google.com → OAuth 2.0 Client ID → Web application.
   - Authorized JavaScript origins: `http://localhost:3000`, `https://karbonlens.netlify.app`
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`, `https://karbonlens.netlify.app/api/auth/callback/google`
   - Save client ID and secret.
2. Add to `.env.local` and Netlify env vars: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET` (openssl rand -base64 32), `NEXTAUTH_URL`.
3. Configure NextAuth at `lib/auth.ts`:
   ```typescript
   import NextAuth from 'next-auth';
   import Google from 'next-auth/providers/google';
   import { DrizzleAdapter } from '@auth/drizzle-adapter';
   import { db } from './db';
   
   export const { handlers, auth, signIn, signOut } = NextAuth({
     adapter: DrizzleAdapter(db),
     providers: [Google],
     session: { strategy: 'database' },
     callbacks: {
       async session({ session, user }) {
         session.user.id = user.id;
         return session;
       },
     },
   });
   ```
4. Create `app/api/auth/[...nextauth]/route.ts` re-exporting handlers.
5. Create `middleware.ts` protecting `/projects`, `/prices`, `/alerts` — redirect to `/` with sign-in button if not authenticated. Keep `/projects` partially accessible for public (top 3 projects) but that's a page-level check.
6. Add a "Sign in with Google" button to the landing page hero and to the top nav.
7. Add a sign-out button to the top nav avatar.
8. On first login, the NextAuth adapter creates a row in `users`. Make sure our `users` table schema matches what the Drizzle adapter expects — may need a migration to add any missing fields.

**Acceptance:**
- [ ] Clicking "Sign in with Google" on karbonlens.netlify.app completes OAuth round-trip
- [ ] After sign-in, `users` table has a row with the user's email
- [ ] `sessions` table has a row with a valid token
- [ ] Accessing `/prices` while signed-out redirects to landing
- [ ] Accessing `/prices` while signed-in renders the page
- [ ] Sign-out clears the session

**Notes:**
- Set `email_digest_opt_in = TRUE` by default on user creation, as per `docs/architecture.md`.
- First-time user: show a one-time onboarding modal asking for `persona` and `organization`. Save to `users` table. (Simple form, skip if you're strapped for time.)

---

## Phase 2 — Data pipelines (T06–T10)

Three scrapers and some seeded manual data. After this phase, real data exists in the DB.

### T06 — Verra scraper: fetch + parse + upsert

**Goal:** A Python scraper that fetches Indonesia-filtered Verra project data and writes to the DB. Runs weekly.

**Blocked by:** T02

**Context:** Verra registry at `registry.verra.org`. No public API. HTML scraping is the path. Target ~40 Indonesian VCS projects. See `docs/architecture.md` Section 5.1.

**Do this:**

1. In `scrapers/`, initialize Python project with uv:
   ```bash
   cd scrapers
   uv init
   uv add psycopg[binary] httpx beautifulsoup4 lxml structlog python-dotenv
   uv add --dev ruff
   ```
2. Create `scrapers/common/db.py` with a psycopg connection helper that reads `DATABASE_URL`.
3. Create `scrapers/common/config.py` that loads `.env` via `python-dotenv`.
4. Create `scrapers/common/logging.py` with structlog JSON formatter.
5. Create `scrapers/verra/fetch.py`:
   - Module entrypoint: `python -m scrapers.verra.fetch`
   - Fetches the Verra project search page with filter `Country = Indonesia`
   - Parses the results table → list of project IDs + basic fields
   - For each project ID, fetches detail page → extracts methodology, hectares, developer, validation date, VCU totals
   - Normalizes into schema: projects.name_canonical, developer, project_type, methodology, hectares, validation_date
   - **Entity resolution:** before inserting, query `projects` for existing rows where `name_aliases @> ARRAY[<name>]` or name similarity > 0.85 (use Postgres `similarity()` from `pg_trgm`). If match found with similarity in [0.70, 0.95), insert into `project_match_queue` for human review. If > 0.95, skip insert and update existing. If < 0.70, insert as new project.
   - Writes/updates `projects` + `registries` (with `registry_name='Verra'`, `external_id='VCS####'`)
   - For each project, also fetches issuance history and writes to `issuances`
   - Writes raw HTML response to `raw_metadata` JSONB
6. Install `pg_trgm` extension for fuzzy matching: add `CREATE EXTENSION IF NOT EXISTS pg_trgm;` to migration 001 (amend and re-apply).
7. Set `status` to `active` if listed as Registered, `pipeline` if Under Development, `suspended` otherwise.
8. Run locally against staging DB. Verify ~40 projects appear in `projects` table.
9. Create `scrapers/scripts/run_weekly_verra.sh`:
   ```bash
   #!/bin/bash
   source /opt/karbonlens/.env
   cd /opt/karbonlens
   /opt/karbonlens/scrapers/.venv/bin/python -m scrapers.verra.fetch >> /var/log/karbonlens/verra.log 2>&1
   ```

**Acceptance:**
- [ ] `python -m scrapers.verra.fetch` completes without error
- [ ] `SELECT COUNT(*) FROM projects WHERE country='ID';` returns ≥ 30
- [ ] `SELECT COUNT(*) FROM registries WHERE registry_name='Verra';` returns ≥ 30
- [ ] `SELECT COUNT(*) FROM issuances;` returns > 50
- [ ] Re-running the scraper is idempotent (no duplicates, updates timestamps only)
- [ ] `project_match_queue` has entries for ambiguous matches (review manually, likely 0 on first run)
- [ ] Known test project (Katingan, VCS1477) has correct fields populated

**Notes:**
- Respect Verra with a 3-second delay between project detail fetches.
- If Verra's HTML changes and scraper breaks, log the broken record and continue — don't halt the whole run.
- Centroid coordinate: Verra rarely lists exact coordinates. For v0.1, geocode the province centroid as a very rough proxy, then manually override for top 10 known projects. Add to the task a `scripts/seed_centroids.py` that runs once.

---

### T07 — GFW alerts scraper: geostore + query + upsert

**Goal:** For each project in DB, fetch last 90 days of integrated deforestation alerts from GFW, intersect with project buffer, store. Runs weekly.

**Blocked by:** T02, T06 (needs projects with centroids)

**Context:** GFW Data API at `data-api.globalforestwatch.org`. Free API key from `globalforestwatch.org/help/developers/`. See `docs/architecture.md` Section 5.2.

**Do this:**

1. Register for a GFW API key. Store in `.env` as `GFW_API_KEY`.
2. Create `scrapers/gfw/fetch.py`:
   - For each project in `projects` where `centroid IS NOT NULL`:
     - Build GeoJSON polygon: circle around centroid with radius = buffer_km (default 10km). Use `shapely` + pyproj to create a proper geodesic buffer.
     - POST to `https://data-api.globalforestwatch.org/geostore` with the GeoJSON → get `gfw_geostore_id`. Cache this ID per project (add `gfw_geostore_id TEXT` column to `projects`, null-ok).
     - Query `GET /dataset/gfw_integrated_alerts/latest/query/json` with SQL:
       ```sql
       SELECT gfw_integrated_alerts__date, gfw_integrated_alerts__confidence, 
              longitude, latitude, gfw_integrated_alerts__date as alert_date
       FROM data 
       WHERE gfw_integrated_alerts__date >= '2026-01-20'  -- last 90 days, parametrize
       ```
       with header `x-api-key: <key>` and query param `geostore_id=<id>`.
     - Parse response rows, write to `satellite_alerts` with:
       - `project_id` = the project
       - `alert_source` = 'INTEGRATED' (or parse the specific source if available)
       - `alert_date` = date from response
       - `confidence` = 'nominal' or 'high' (GFW uses numeric confidence, map 2→nominal, 3→high)
       - `location` = ST_Point(longitude, latitude)
       - `area_ha` = 0.01 (single pixel at 10m → 100m² → 0.01 ha; sum for clustered alerts)
       - `inside_project_buffer` = TRUE (already confirmed by geostore filtering)
       - `raw_payload` = the full response row as JSONB
     - Dedupe on `(project_id, alert_date, location)` — use `ON CONFLICT DO NOTHING`.
   - Rate limit: 1 request/sec between projects.
   - Log: projects processed, alerts inserted, errors.
3. Add `gfw_geostore_id` column via a new migration `002_add_geostore.sql`.
4. After fetching alerts for a project, check for new alerts (inserted in this run) and create `notifications` rows for all users (for v0.1, notify all users about all flagship projects' alerts; v0.2 adds watchlists):
   ```sql
   INSERT INTO notifications (user_id, type, title, description, project_id, url)
   SELECT u.id, 'reversal', 'Deforestation alert in <project>', '<X.X ha detected>', <project_id>, '/projects/<slug>'
   FROM users u
   WHERE u.email_digest_opt_in = TRUE;  -- minimum gate
   ```
5. Create `scrapers/scripts/run_weekly_gfw.sh`.

**Acceptance:**
- [ ] `python -m scrapers.gfw.fetch` completes without error
- [ ] Every project with a centroid has a `gfw_geostore_id` populated after first run
- [ ] `SELECT COUNT(*) FROM satellite_alerts;` returns > 50 for 90-day window across all projects
- [ ] Katingan (VCS1477) has at least a few alerts (peatland, active region)
- [ ] Re-running doesn't create duplicates
- [ ] New alerts generate `notifications` rows
- [ ] Rate limiting observed (run takes at least N_projects seconds)

**Notes:**
- The GFW API response format has changed in the past; confirm the exact SQL column names by hitting the API once interactively.
- Some projects may have no alerts — that's a success case, log "0 alerts" and continue.

---

### T08 — IDXCarbon monthly PDF scraper

**Goal:** Fetch the monthly PDF report from idxcarbon.co.id, parse the aggregate numbers, store in `idx_monthly_snapshots`. Runs monthly on the 1st.

**Blocked by:** T02

**Context:** IDXCarbon posts monthly reports as PDFs at `idxcarbon.co.id/data-monthly`. See `docs/architecture.md` Section 5.3.

**Do this:**

1. Install deps:
   ```bash
   cd scrapers
   uv add pdfplumber
   ```
2. Create `scrapers/idxcarbon/fetch_monthly.py`:
   - Fetch `https://idxcarbon.co.id/data-monthly` HTML
   - Parse the PDF links, extract period month from the filename or link text
   - For each PDF not already in `idx_monthly_snapshots` (check by `period_month`):
     - Download the PDF to `/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf`
     - Parse with `scrapers/idxcarbon/parse_pdf.py`
     - Insert into `idx_monthly_snapshots`
3. Create `scrapers/idxcarbon/parse_pdf.py`:
   - Opens PDF with pdfplumber
   - Extracts text page-by-page
   - Uses regex patterns to pull the named fields (total volume, total value, participants, etc.)
   - Returns a dict matching `idx_monthly_snapshots` columns
   - When a pattern doesn't match, raise `ParseError` with the page text — fail loudly (per scraper conventions)
4. Seed with historical data:
   - Download all available monthly reports from Sept 2023 to current
   - Parse and insert each
5. Create `scrapers/scripts/run_monthly_idxcarbon.sh`.

**Acceptance:**
- [ ] `python -m scrapers.idxcarbon.fetch_monthly` completes successfully
- [ ] `SELECT COUNT(*) FROM idx_monthly_snapshots;` returns ≥ 24 (months from Sept 2023 to Apr 2026)
- [ ] Latest available month has sensible values (e.g., Jan 2026: ~117k tCO2e volume, ~Rp 4.7B value)
- [ ] PDF archive at `/var/lib/karbonlens/pdf-archive/` contains the downloaded files
- [ ] Re-running skips already-ingested months

**Notes:**
- IDXCarbon report format has evolved; older reports may have different layouts. Add `--from-month YYYY-MM` flag to skip problematic older reports if needed.
- If parsing fails for one report, log it and move on — don't block the pipeline for historical data issues.

---

### T09 — Score computation daily job

**Goal:** A Python job that computes integrity scores per project based on latest data and writes to `project_scores`. Runs daily.

**Blocked by:** T06, T07

**Context:** Score methodology in `docs/architecture.md` Section 8. Framework only — weights are in code constants, not locked yet.

**Do this:**

1. Create `scrapers/scoring/compute.py`:
   - For each project in `projects`:
     - Compute `validation_recency_score` from `validation_date`
     - Compute `reversal_score` from `satellite_alerts` in last 90 days inside project
     - For v0.1, set `community_score` = 75 for all projects except known-flagged (Rimba Raya=45, Cendrawasih Aru=30). Hardcode these overrides in a dict.
     - Compute `transparency_score` from registry count: 2+ registries → 85, 1 registry with status 'active' → 70, else 50
     - Weighted composite → `integrity_score`
   - Insert into `project_scores` with today's date
2. The weighting constants live in `scrapers/scoring/weights.py`:
   ```python
   WEIGHTS = {
       'validation_recency': 0.25,
       'reversal_risk':     0.35,
       'community_flags':   0.20,
       'transparency':      0.20,
   }
   VERSION = 'v1'
   ```
3. Mirror these constants in `lib/score.ts` for any frontend display logic. Add a note in both files that they must stay in sync.
4. Create `scrapers/scripts/run_daily_score.sh`.

**Acceptance:**
- [ ] `python -m scrapers.scoring.compute` completes without error
- [ ] `SELECT COUNT(*) FROM project_scores WHERE score_date = CURRENT_DATE;` equals the project count
- [ ] Katingan score is in 75–85 range (high validation recency, moderate reversal risk, dual-registered)
- [ ] Rimba Raya score is in 50–65 range (community flag hit)
- [ ] Scores are idempotent per day (re-running replaces today's entries via `ON CONFLICT UPDATE`)

**Notes:**
- Don't agonize over calibration. The scores will be rough. The methodology page will be transparent.
- Add a `components` JSONB column population with the raw inputs so we can audit later.

---

### T10 — Seed regulatory events manually

**Goal:** Populate `regulatory_events` with the 10 most important Indonesian carbon regulations so the regulatory timeline screen has real content.

**Blocked by:** T02

**Context:** v0.1 skips the regulatory scraper. We curate by hand. The 10 events are already specified in the design brief under Screen 5.

**Do this:**

1. Create `scrapers/scripts/seed_regulatory.sql` with INSERT statements for:
   - Permenhut 6/2026 (13 Apr 2026, Critical, Kemenhut)
   - Perpres 110/2025 (Oct 2025, Critical, Presidential)
   - Verra–Indonesia MRA (Oct 2025, High, KLH)
   - SRN-PPI v2 (Aug 2025, Medium, KLH)
   - IDXCarbon opens to international (Jan 2025, High, OJK)
   - PNBP rate determination (Expected Q3 2026, High, Kemenhut, `is_upcoming=TRUE`)
   - Fiscal regime & buffer mechanism (Expected Oct 2026, Medium, Multi-ministry, `is_upcoming=TRUE`)
   - Plus 3 more the founder wants to call out — Andy adds based on judgment
2. Use the copy from the design brief Screen 5 for titles and descriptions.
3. Apply: `psql -U karbonlens -d karbonlens -f scrapers/scripts/seed_regulatory.sql`
4. Commit the seed file (with `ON CONFLICT DO NOTHING` so re-running is safe).

**Acceptance:**
- [ ] `SELECT COUNT(*) FROM regulatory_events;` returns ≥ 7
- [ ] Permenhut 6/2026 is present with all fields
- [ ] Upcoming events are flagged correctly

**Notes:**
- This is a human task; Claude Code mostly just writes the SQL INSERTs based on the design brief copy.
- Plan: Andy will add new events directly via SQL or a small admin form in v0.2.

---

## Phase 3 — Frontend integration (T11–T18)

Wire each screen to real data. By the end of this phase, karbonlens.netlify.app is a live product.

### T11 — Projects explorer screen with real data

**Goal:** The `/projects` page renders live data from Postgres. Table + filters work. Free tier vs authenticated gating works.

**Blocked by:** T04, T06

**Do this:**

1. Create API route `app/api/projects/route.ts`:
   - Accepts query params: `type`, `province`, `min_score`, `limit`, `offset`, `q` (search)
   - Joins `projects` + `project_scores` (latest) + `registries` (grouped)
   - Returns JSON matching the shape from `KarbonLens_Design_Brief.md` Section 6
   - If the caller is unauthenticated, limits to 3 flagship projects (Katingan, Sumatra Merang, Rimba Raya) regardless of filters
2. Create `app/(app)/projects/page.tsx`:
   - Server component that calls `/api/projects` (or directly queries DB — prefer direct for server components)
   - Renders the filter bar and table per design brief
   - Table columns: project, type, province, score, available, registries
   - Clicking a row navigates to `/projects/[slug]`
   - "Export CSV" button (authenticated only): exports current filtered set
3. Implement filter state in URL search params for shareable filtered views.
4. Handle loading state gracefully (server components handle most of this).
5. Show the "Data refreshed X minutes ago" footer using the max `updated_at` across projects.

**Acceptance:**
- [ ] `/projects` renders 30+ real projects from DB (authenticated)
- [ ] `/projects` renders only 3 projects when not signed in
- [ ] Filters narrow the list correctly
- [ ] Search matches project names and developers
- [ ] Clicking a row goes to the detail page
- [ ] Export CSV downloads a correct file (simple version: client-side CSV generation)

---

### T12 — Project detail screen with real data

**Goal:** `/projects/[slug]` shows complete project dossier with real data: stats, score breakdown, news (seed placeholder if no news yet), issuance chart.

**Blocked by:** T04, T06, T07, T09

**Do this:**

1. Create API route `app/api/projects/[id]/route.ts`:
   - Returns full project data: project + latest score + all registries + issuances grouped by vintage + recent alerts + news (empty for v0.1)
   - Respects auth: public users only see the 3 flagship projects fully, rest return 403
2. Create `app/(app)/projects/[slug]/page.tsx`:
   - Server component that fetches by slug
   - Renders the design brief Screen 3 layout: breadcrumb, header with watch/alert buttons, 5 stat cards, two-column section (map placeholder + score breakdown), issuances chart, news feed
   - Map is placeholder for now — T13 replaces with real MapLibre
   - Issuances chart: use Recharts BarChart with bars per vintage year, from real issuance data
3. Handle missing data gracefully: if a project has no issuances yet, show "Pipeline — no issuances" in place of chart.
4. News feed for v0.1: show a mix of the regulatory events that match the project's registries + any satellite alerts from last 30 days as "news items."

**Acceptance:**
- [ ] `/projects/katingan-peatland` renders with real data
- [ ] Score breakdown bars reflect the score_components from DB
- [ ] Issuances chart shows real vintage years
- [ ] Recent alerts list shows real GFW alerts
- [ ] Unauthenticated access to non-flagship projects returns 403 with "Sign in to view" CTA

---

### T13 — Map integration

**Goal:** Add the interactive MapLibre map to the project detail page (Map B) and the optional map tab on projects explorer (Map A). Map C (full map view screen) remains in v0.1 per user decision.

**Blocked by:** T11, T12

**Context:** Full specs in `KarbonLens_Design_Brief_Maps_Addendum.md`. Use MapLibre GL JS v5, Esri World Imagery as satellite basemap, free.

**Do this:**

1. Install MapLibre:
   ```bash
   npm i maplibre-gl
   ```
2. Create `components/map/MapA_CountryOverview.tsx`:
   - Receives `projects` prop (array of {centroid, score, name, slug})
   - Default view: Indonesia bounds [95, -11, 141, 6], zoom 4.2
   - Markers per design addendum Section 3 Map A
   - Clicking a marker opens popover → "View detail →" navigates to project
3. Create `components/map/MapB_ProjectDetail.tsx`:
   - Receives `project` and `alerts` props
   - Default view: fit to project centroid + buffer
   - Satellite basemap (Esri) by default
   - Project boundary: circle rendered from centroid + buffer_km (v0.1 proxy; v0.2 replaces with polygon)
   - Alert dots overlaid from `alerts` array
   - Basemap toggle: `Satellite | Street` (skip Forest cover + Peatland for v0.1 to save time — note in the addendum)
4. Create `components/map/MapC_FullView.tsx`:
   - New `/map` route per addendum Section 3 Map C
   - Sidebar overlay with layer toggles (projects, reversal alerts; skip fire alerts/forest cover/peatland for v0.1)
   - Time slider for date range
5. Add map to project detail (replaces placeholder) and add tab toggle to projects explorer.
6. Add "Map" to top nav.
7. Apply `filter: saturate(0.85)` to satellite tile layer as specified in addendum.

**Acceptance:**
- [ ] `/projects` with map tab shows all projects as colored dots on Indonesia
- [ ] `/projects/katingan-peatland` shows satellite imagery with buffer circle and alerts
- [ ] `/map` renders with sidebar + layer toggles
- [ ] No console errors
- [ ] Mobile responsive (collapses sidebar on <768px)

**Notes:**
- Drop the peatland/forest-cover toggles from Map B for v0.1 — they need more data than we have. Stub them as "Coming soon" or just hide.
- If the full Map C screen is too much, cut it and keep just the tab on /projects + detail page map. Speak to the user decision ("all but map") — you ARE keeping map, which is correct.

---

### T14 — Price intelligence screen with real data

**Goal:** `/prices` renders IDXCarbon historical data from `idx_monthly_snapshots`.

**Blocked by:** T04, T08

**Do this:**

1. Create API route `app/api/prices/idxcarbon/route.ts`:
   - Returns time series from `idx_monthly_snapshots`
   - Query params: `from`, `to` (ISO dates)
2. Create `app/(app)/prices/page.tsx` per design brief Screen 4:
   - Stat cards: latest month value, volume, avg price, participants (with deltas vs previous month)
   - Line chart: 6 months of avg_price_idr (single series for v0.1 — we don't have per-credit-type breakdown until v0.2)
   - Transactions table: the latest month's snapshot as a single row (until we add daily scraper)
3. Handle the 1M/6M/1Y/All time range pills by querying with different `from` params.

**Acceptance:**
- [ ] `/prices` shows real IDXCarbon data
- [ ] Latest month stats match the raw report (verify manually against the PDF)
- [ ] Chart renders 6 months of history
- [ ] Time range pills update the chart

**Notes:**
- The design brief shows 3 lines (IDTBS-RE, IDTBS, IDNBS). v0.1 data is only aggregate avg_price_idr. Show a single line and note "breakdown coming in v0.2."
- Transactions table from the design is daily-level; v0.1 has only monthly. Replace the "Recent transactions" section with "Monthly aggregates" for now.

---

### T15 — Regulatory timeline screen with real data

**Goal:** `/regulatory` renders from `regulatory_events` table.

**Blocked by:** T04, T10

**Do this:**

1. Create API route `app/api/regulatory/route.ts`.
2. Create `app/(app)/regulatory/page.tsx` per design brief Screen 5:
   - Sorted by event_date DESC (most recent first)
   - Upcoming events (`is_upcoming=TRUE`) at the top with an "Upcoming" visual treatment
   - Filter by ministry
   - "Subscribe" button is placeholder for v0.1 (wire up in v0.2 with watchlists)

**Acceptance:**
- [ ] `/regulatory` shows all seeded regulatory events
- [ ] Filter by ministry works
- [ ] Upcoming events visually distinct
- [ ] Public route (no auth required)

---

### T16 — Notifications bell + alerts inbox

**Goal:** The bell icon in the top nav shows unread count. `/alerts` renders the user's notification inbox.

**Blocked by:** T04, T05, T07

**Do this:**

1. Create API route `app/api/alerts/route.ts`:
   - Returns current user's notifications, ordered by created_at DESC
   - Separate `unread_count` in response
2. Create API route `app/api/alerts/mark-read/route.ts`:
   - POST body: `{notification_ids: string[]}` or `{all: true}`
   - Updates `read_at` for matching rows
3. Update `components/ui/TopNav.tsx` to fetch unread count and show red dot.
4. Create `app/(app)/alerts/page.tsx` per design brief Screen 6:
   - Render all notifications for the user
   - Read/unread states visually distinct
   - Clicking a notification marks it read and navigates to `url`
   - Filter pills: All / Reversal / Regulatory (skip the others for v0.1)

**Acceptance:**
- [ ] Signed-in user sees bell with red dot if they have unread notifications
- [ ] `/alerts` renders the user's notifications
- [ ] Clicking a notification marks it read
- [ ] Mark all read button works
- [ ] When GFW scraper finds new alerts (T07), they appear in alerts inbox within a minute of DB insert

**Notes:**
- GFW alerts from T07 create notifications. For v0.1, every alert = notification for every user (simple, may be noisy). v0.2 adds watchlists.

---

### T17 — Weekly digest email via Resend

**Goal:** Every Monday 09:00 Asia/Jakarta, send a digest email to opted-in users with their undigested notifications from the past week.

**Blocked by:** T16

**Context:** Resend free tier covers 3,000 emails/month — plenty for v0.1. `docs/architecture.md` Section 9 specifies the flow.

**Do this:**

1. Sign up for Resend, get API key. Add to `.env` as `RESEND_API_KEY`.
2. Install:
   ```bash
   npm i resend react-email @react-email/components
   ```
3. Create `emails/digest.tsx`: React Email template.
   - Header: "KarbonLens — this week's market intelligence"
   - Section 1: top 5 notifications
   - Section 2: ~1 paragraph market summary (manually written by Andy each week; v0.2 auto-generates)
   - Unsubscribe link
4. Create API route `app/api/digest/cron/route.ts`:
   - Verifies `X-Cron-Secret` header matches `DIGEST_CRON_SECRET`
   - Queries opted-in users with undigested notifications from last 7 days
   - For each user, renders the email and sends via Resend
   - Updates `notifications.digested_at`
5. Create `scrapers/scripts/run_weekly_digest.sh`:
   ```bash
   curl -X POST -H "X-Cron-Secret: $DIGEST_CRON_SECRET" https://karbonlens.netlify.app/api/digest/cron
   ```
6. Add to cron: Mondays 09:00 Asia/Jakarta = 02:00 UTC.
7. Add unsubscribe page at `/unsubscribe?token=xxx` that sets `email_digest_opt_in = FALSE`.

**Acceptance:**
- [ ] Manually triggering the cron endpoint sends a test email to your own account
- [ ] Email renders correctly in Gmail
- [ ] Unsubscribe link works
- [ ] `digested_at` is updated
- [ ] Cron fires weekly on the VPS

---

### T18 — Landing page with live stats

**Goal:** The public landing page renders real market stats from the DB.

**Blocked by:** T11, T14

**Do this:**

1. Update `app/(public)/page.tsx`:
   - Query live stats: project count, latest IDXCarbon volume + price, alert count last 7 days
   - Keep the 3 featured project cards (Katingan, Sumatra Merang, Rimba Raya)
   - Pricing section shows "Pro tier coming soon" since we deferred payments
   - Google sign-in CTA instead of "Start free" for now
2. Server-side fetch — no client-side DB query.
3. Cache the stats server-side for 1 hour (Next.js `revalidate = 3600`).

**Acceptance:**
- [ ] Landing page shows real project count, real volume, real price
- [ ] Updates within an hour of underlying data changing
- [ ] Sign-in button initiates Google OAuth

---

## Phase 4 — Ops, polish, handoff (T19–T23)

### T19 — Cron installation on VPS

**Goal:** All scheduled jobs run automatically on the Hetzner box.

**Blocked by:** T06, T07, T08, T09, T17

**Do this:**

1. SSH to VPS as karbonlens (or root and sudo).
2. Create `/etc/cron.d/karbonlens` with the schedule from `docs/architecture.md` Section 4.
3. Create logrotate config at `/etc/logrotate.d/karbonlens`:
   ```
   /var/log/karbonlens/*.log {
     weekly
     rotate 12
     compress
     missingok
     notifempty
   }
   ```
4. Verify all scripts have execute permission: `chmod +x /opt/karbonlens/scrapers/scripts/*.sh`
5. Trigger each script manually once to verify, check logs.

**Acceptance:**
- [ ] `systemctl status cron` shows cron running
- [ ] Manual run of each script writes to `/var/log/karbonlens/<scraper>.log` without error
- [ ] After one week of running, logs show scheduled execution
- [ ] Logrotate creates `.gz` archives

---

### T20 — Backups + pg_dump cron

**Goal:** Nightly DB backups, 14-day retention, off-site copy to Hetzner Storage Box weekly.

**Blocked by:** T01

**Do this:**

1. Create `/opt/karbonlens/scripts/backup.sh`:
   ```bash
   #!/bin/bash
   DATE=$(date +%Y-%m-%d)
   pg_dump -U karbonlens -d karbonlens | gzip > /var/lib/karbonlens/backups/$DATE.sql.gz
   # Keep 14 days
   find /var/lib/karbonlens/backups -name "*.sql.gz" -mtime +14 -delete
   ```
2. Add to cron: nightly 01:00.
3. (Optional for v0.1) Set up Hetzner Storage Box, configure `rsync` to push backups weekly.

**Acceptance:**
- [ ] Backup script runs without error
- [ ] Backup file in `/var/lib/karbonlens/backups/` is non-zero size
- [ ] Restoring from backup to a test DB succeeds (do this once as a drill)
- [ ] 14-day retention working after 2 weeks

---

### T21 — Entity resolution review admin page

**Goal:** A simple page (Andy only) to review and approve/reject matches in `project_match_queue`.

**Blocked by:** T06

**Do this:**

1. Create `app/(app)/admin/matches/page.tsx`:
   - Protected by a simple env var check: only renders for `NEXT_PUBLIC_ADMIN_EMAIL`
   - Lists pending matches from `project_match_queue`
   - For each: show both candidates side-by-side with key fields
   - Three buttons: Merge (keeps A, moves aliases to A, deletes B), Keep separate (rejects match), Skip
2. Create API routes for each action.
3. Simple, functional, ugly is fine.

**Acceptance:**
- [ ] Andy sees /admin/matches when signed in with admin email
- [ ] Non-admins get 404
- [ ] Merge action correctly consolidates projects
- [ ] After reviewing all ambiguous matches (~10–15), `project_match_queue` has status != 'pending' for all

---

### T22 — Sentry error tracking

**Goal:** Errors in production surface to Sentry instead of silently failing.

**Blocked by:** T03

**Do this:**

1. Sign up for Sentry free tier.
2. Install `@sentry/nextjs`.
3. Run `npx @sentry/wizard@latest -i nextjs`.
4. Add `SENTRY_DSN` to Netlify env vars.
5. Test: trigger a deliberate error, verify it appears in Sentry dashboard.

**Acceptance:**
- [ ] Sentry dashboard receives errors from production
- [ ] Source maps are uploaded correctly
- [ ] User context (email) is attached to errors for signed-in users

---

### T23 — Replace static prototype with live Next.js build

**Goal:** karbonlens.netlify.app serves the real Next.js app with real data. The static prototype is retired.

**Blocked by:** T11, T12, T14, T15, T16, T18

**Do this:**

1. Verify the Netlify site is building from `main` branch
2. Remove any static HTML fallback from the repo
3. Smoke test all screens while logged out AND logged in:
   - Landing page loads with live stats
   - /projects shows real projects (3 for public, full list for authed)
   - /projects/katingan-peatland renders fully
   - /prices shows IDXCarbon history
   - /regulatory shows seeded events
   - /alerts shows notifications (authed only)
4. Take screenshots for the record.
5. Post an internal note: "v0.1 live."

**Acceptance:**
- [ ] karbonlens.netlify.app is the live product, not a mock
- [ ] All 6 screens work with real data
- [ ] Lighthouse score >85 on landing page
- [ ] No console errors on any screen

---

## Post-v0.1 backlog (don't start until v0.1 ships)

These are tracked separately, don't mix into the v0.1 sprint:

- SRN-PPI scraper (high value, high complexity, defer)
- Gold Standard scraper
- News scrapers (Mongabay, Kompas, Tempo, Jakarta Post)
- Regulatory scraper (Kemenhut, JDIH)
- Paperclip / openclaw orchestration
- Pro tier + Stripe
- Midtrans (IDR payments)
- Bilingual UI chrome
- Telegram bot
- Real project polygons (manual digitization)
- Watchlists
- Team accounts
- Public API with keys
- Substack weekly digest
- Tests (pytest for scrapers, Playwright for frontend)

---

## Notes for Claude Code

1. **Before starting any task, read both `PRD.md` and `docs/architecture.md` fully.** This task file is dense; context lives in the other two.
2. **Ask Andy before making architectural choices not specified.** E.g., "should I use React Server Components or client components here?" — don't just pick.
3. **When a task says "follow the design brief exactly," that means exactly.** Don't adapt. Ask if a pattern is unclear.
4. **When a scraper fails, don't silently swallow errors.** Log it, write to `scraper_runs` (add later), exit non-zero.
5. **Idempotency is a hard requirement.** Every scraper must be safely re-runnable.
6. **Commit often, push often.** Each task should end with a commit. Open a PR against `main` so Andy can review before merging.
7. **Don't optimize prematurely.** No caching, no Redis, no read replicas. Postgres on a single box is fine for v0.1.
8. **No automated tests for v0.1.** Don't spend time on them unless Andy asks.
9. **When in doubt, cut scope rather than delay.** End-of-May target is real.

---

*End of tasks playbook. Last updated April 20, 2026.*
