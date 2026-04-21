# KarbonLens — Architecture

**Audience:** Claude Code and any future engineer. Read this before touching any implementation task.
**Companion to:** `PRD.md` (strategic), `TASKS.md` (tactical task list).

---

## 1. System shape

```
┌─────────────────────────────────────────────────────────────────────┐
│  User browser                                                        │
│  https://karbonlens.netlify.app                                      │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ HTTPS
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Netlify — Next.js 15 app                                            │
│  • Pages (App Router, server components)                             │
│  • API routes: /api/projects, /api/prices, /api/alerts, etc.        │
│  • NextAuth.js v5 with Google provider                               │
│  • Server components fetch from Postgres via Drizzle                 │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ Postgres wire protocol (SSL)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Hetzner CX32 VPS (staging) / larger (production)                    │
│                                                                       │
│  ┌────────────────────────────┐    ┌──────────────────────────────┐│
│  │  PostgreSQL 16             │    │  Scraper pool (Python 3.12)  ││
│  │  + PostGIS extension       │◄───│  /opt/karbonlens/scrapers/   ││
│  │                            │    │  scheduled via cron           ││
│  │  - projects, registries    │    │                               ││
│  │  - issuances, retirements  │    │  Reads from:                  ││
│  │  - idx_transactions        │    │  • registry.verra.org         ││
│  │  - satellite_alerts        │    │  • data-api.globalforest…     ││
│  │  - idx_monthly_snapshots   │    │  • idxcarbon.co.id            ││
│  │  - regulatory_events       │    │                               ││
│  │  - users, sessions         │    │  Writes directly to Postgres  ││
│  │  - notifications           │    │  via psycopg                  ││
│  └────────────────────────────┘    └──────────────────────────────┘│
│                                                                       │
│  Optional later: Resend webhook handler for digest email bounces     │
└─────────────────────────────────────────────────────────────────────┘

External outbound only:
  • Netlify app calls Resend API for weekly digest (scheduled via Vercel Cron or GitHub Actions)
  • Frontend calls MapLibre + Esri tile URLs directly (browser-side)
```

### What's explicitly not in the system
- No Redis
- No separate backend service (Next.js API routes are the backend)
- No job queue (cron + idempotent scrapers)
- No Docker orchestration (plain systemd + cron)
- No CDN in front of Postgres (direct connection from Netlify)
- No paperclip / openclaw integration in v0.1 (planned for v0.2 scraper automation)

---

## 2. Repository layout

Single monorepo at `github.com/talkinandy/karbonlens`.

```
karbonlens/
├── PRD.md                          # strategy (this handoff)
├── TASKS.md                        # tactical task playbook
├── README.md                       # getting-started for a new dev
├── docs/
│   ├── architecture.md             # this file
│   ├── schema.sql                  # canonical DB schema
│   ├── scraper-patterns.md         # conventions every scraper follows
│   └── methodology.md              # score methodology, user-facing later
├── app/                            # Next.js 15 App Router
│   ├── (public)/                   # routes accessible without login
│   │   ├── page.tsx                # landing
│   │   └── layout.tsx
│   ├── (app)/                      # routes requiring Google OAuth
│   │   ├── projects/
│   │   │   ├── page.tsx            # projects explorer (table + map tab)
│   │   │   └── [id]/page.tsx       # project detail
│   │   ├── prices/page.tsx
│   │   ├── regulatory/page.tsx
│   │   ├── alerts/page.tsx
│   │   └── layout.tsx
│   └── api/
│       ├── auth/[...nextauth]/route.ts
│       ├── projects/route.ts
│       ├── projects/[id]/route.ts
│       ├── prices/route.ts
│       ├── alerts/route.ts
│       └── digest/route.ts         # weekly digest cron target
├── lib/
│   ├── db.ts                       # Drizzle client
│   ├── schema.ts                   # Drizzle schema (TypeScript)
│   ├── auth.ts                     # NextAuth config
│   └── score.ts                    # score calculation
├── components/                     # React components
│   ├── ui/                         # primitives per design brief
│   ├── map/                        # MapLibre wrappers
│   └── ...
├── scrapers/                       # Python, separate venv
│   ├── pyproject.toml
│   ├── common/
│   │   ├── db.py                   # psycopg helpers
│   │   ├── config.py               # env var loader
│   │   └── logging.py
│   ├── verra/
│   │   └── fetch.py                # python -m scrapers.verra.fetch
│   ├── gfw/
│   │   └── fetch.py
│   ├── idxcarbon/
│   │   ├── fetch_monthly.py
│   │   └── parse_pdf.py
│   ├── migrations/                 # SQL migrations applied by psql
│   │   ├── 001_init.sql
│   │   └── ...
│   └── scripts/
│       └── run_all.sh              # cron entry point
├── public/                         # static assets
├── .env.example
├── .env.local                      # local dev, gitignored
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── drizzle.config.ts
```

Python scrapers are in the same repo for v0.1 (simpler CI, one git pull). Can be extracted to a separate repo in v0.2 if they grow significantly.

---

## 3. Database schema

Authoritative schema lives at `docs/schema.sql`. Drizzle TypeScript schema at `lib/schema.ts` is derived from it. When they disagree, `schema.sql` wins and the Drizzle schema is updated to match.

### Core tables for v0.1

```sql
-- Enable extensions (Task 1 handles this)
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Projects (canonical entity after entity resolution)
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT NOT NULL UNIQUE,
  name_canonical  TEXT NOT NULL,
  name_aliases    TEXT[],
  developer       TEXT,
  country         CHAR(2) NOT NULL DEFAULT 'ID',
  province        TEXT,
  regency         TEXT,
  project_type    TEXT,              -- 'REDD+', 'ARR', 'Blue Carbon', etc.
  methodology     TEXT,              -- 'VM0007', 'VM0048', etc.
  hectares        NUMERIC,
  centroid        GEOGRAPHY(POINT, 4326),  -- project center, proxy for polygon in v0.1
  buffer_km       NUMERIC DEFAULT 10,      -- radius for satellite alert intersection
  status          TEXT,                    -- 'active', 'pipeline', 'suspended', 'flagged'
  validation_date DATE,
  first_issuance_date DATE,
  total_vcus_issued    NUMERIC DEFAULT 0,
  total_vcus_retired   NUMERIC DEFAULT 0,
  total_vcus_available NUMERIC GENERATED ALWAYS AS (total_vcus_issued - total_vcus_retired) STORED,
  last_vintage    INT,
  description     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_projects_province  ON projects(province);
CREATE INDEX idx_projects_type      ON projects(project_type);
CREATE INDEX idx_projects_status    ON projects(status);
CREATE INDEX idx_projects_centroid  ON projects USING GIST(centroid);

-- Registry cross-references (one project may exist on Verra + SRN-PPI + Gold Standard)
CREATE TABLE registries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_name   TEXT NOT NULL,     -- 'Verra', 'SRN-PPI', 'Gold Standard', 'IDXCarbon'
  external_id     TEXT NOT NULL,     -- 'VCS1477', etc.
  status          TEXT,
  url             TEXT,
  raw_metadata    JSONB,
  last_synced_at  TIMESTAMPTZ,
  UNIQUE(registry_name, external_id)
);

CREATE INDEX idx_registries_project ON registries(project_id);

-- Issuances (credits issued by registry)
CREATE TABLE issuances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_name   TEXT NOT NULL,
  vintage_year    INT NOT NULL,
  credits         NUMERIC NOT NULL,
  issuance_date   DATE NOT NULL,
  serial_start    TEXT,
  serial_end      TEXT,
  raw_payload     JSONB,
  ingested_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_issuances_project_vintage ON issuances(project_id, vintage_year);

-- Retirements
CREATE TABLE retirements (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  registry_name      TEXT NOT NULL,
  vintage_year       INT,
  credits            NUMERIC NOT NULL,
  retirement_date    DATE NOT NULL,
  beneficiary_name   TEXT,
  beneficiary_country CHAR(2),
  beneficiary_type   TEXT,
  retirement_reason  TEXT,
  raw_payload        JSONB,
  ingested_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_retirements_project_date ON retirements(project_id, retirement_date);

-- IDXCarbon monthly snapshots (aggregate market data)
CREATE TABLE idx_monthly_snapshots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_month     DATE NOT NULL UNIQUE,  -- first day of month
  total_volume_tco2e    NUMERIC,
  total_value_idr       NUMERIC,
  total_transactions    INT,
  trading_days          INT,
  registered_participants INT,
  registered_projects   INT,
  available_units       NUMERIC,
  retired_units         NUMERIC,
  avg_price_idr         NUMERIC,
  raw_report_url        TEXT,
  raw_payload           JSONB,       -- structured extract of the PDF
  scraped_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Satellite alerts (from GFW integrated alerts API)
CREATE TABLE satellite_alerts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id            UUID REFERENCES projects(id) ON DELETE SET NULL,
  alert_source          TEXT NOT NULL,  -- 'RADD', 'GLAD-S2', 'GLAD-L', 'DIST-ALERT', 'VIIRS'
  alert_date            DATE NOT NULL,
  confidence            TEXT,           -- 'low', 'nominal', 'high'
  area_ha               NUMERIC,
  location              GEOGRAPHY(POINT, 4326),
  inside_project_buffer BOOLEAN DEFAULT FALSE,
  raw_payload           JSONB,
  ingested_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sat_project_date ON satellite_alerts(project_id, alert_date);
CREATE INDEX idx_sat_location     ON satellite_alerts USING GIST(location);

-- Regulatory events (v0.1: manually curated; v0.2: scraped)
CREATE TABLE regulatory_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date      DATE NOT NULL,
  ministry        TEXT,     -- 'Kemenhut', 'KLH', 'OJK', 'ESDM', 'Presidential'
  document_type   TEXT,     -- 'Perpres', 'Permen', 'POJK', 'Kepmen', 'MoU'
  document_number TEXT,
  title           TEXT NOT NULL,
  document_url    TEXT,
  summary_en      TEXT,
  summary_id      TEXT,
  importance      TEXT,     -- 'critical', 'high', 'medium', 'low'
  tags            TEXT[],
  is_upcoming     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Score components per project (recomputed on score refresh job)
CREATE TABLE project_scores (
  project_id                UUID REFERENCES projects(id) ON DELETE CASCADE,
  score_date                DATE NOT NULL,
  integrity_score           NUMERIC CHECK (integrity_score BETWEEN 0 AND 100),
  validation_recency_score  NUMERIC,
  reversal_score            NUMERIC,
  community_score           NUMERIC,
  transparency_score        NUMERIC,
  components                JSONB,
  methodology_version       TEXT DEFAULT 'v1',
  PRIMARY KEY (project_id, score_date)
);

-- Entity resolution review queue
CREATE TABLE project_match_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_a_id  UUID REFERENCES projects(id),
  candidate_b_id  UUID REFERENCES projects(id),
  similarity      NUMERIC,
  match_reason    TEXT,             -- 'name_fuzzy', 'centroid_proximity', 'developer_match'
  status          TEXT DEFAULT 'pending',  -- 'pending', 'approved', 'rejected'
  resolved_by     TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Users (populated by NextAuth on first login)
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT UNIQUE NOT NULL,
  email_verified TIMESTAMPTZ,          -- required by @auth/drizzle-adapter v5 (Drizzle field: emailVerified)
  name           TEXT,
  image          TEXT,
  organization   TEXT,
  persona        TEXT,       -- 'buyer', 'broker', 'corporate', 'researcher', 'developer', 'other'
  email_digest_opt_in BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at   TIMESTAMPTZ DEFAULT NOW()
);

-- NextAuth session storage (schema from next-auth adapter)
CREATE TABLE accounts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID REFERENCES users(id) ON DELETE CASCADE,
  type               TEXT NOT NULL,
  provider           TEXT NOT NULL,
  provider_account_id TEXT NOT NULL,
  refresh_token      TEXT,
  access_token       TEXT,
  expires_at         BIGINT,
  token_type         TEXT,
  scope              TEXT,
  id_token           TEXT,
  session_state      TEXT,
  UNIQUE(provider, provider_account_id)
);

CREATE TABLE sessions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT UNIQUE NOT NULL,
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  expires       TIMESTAMPTZ NOT NULL
);

CREATE TABLE verification_tokens (
  identifier TEXT NOT NULL,
  token      TEXT NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Notifications (in-app bell + weekly digest source)
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,    -- 'reversal', 'price', 'regulatory', 'news', 'retirement', 'issuance'
  title       TEXT NOT NULL,
  description TEXT,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  url         TEXT,             -- link to relevant page
  read_at     TIMESTAMPTZ,
  digested_at TIMESTAMPTZ,      -- when this was included in a weekly digest
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_read ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
```

### Migration discipline
- Every schema change goes in a new numbered migration file: `scrapers/migrations/002_add_x.sql`
- Migrations are idempotent (`IF NOT EXISTS`, `IF EXISTS`)
- Applied manually via `psql -f migrations/002_add_x.sql` during v0.1
- v0.2 may add Drizzle Kit for migration automation; for now keep it simple

---

## 4. Scraper patterns

Every scraper in `scrapers/` must follow these conventions. See `docs/scraper-patterns.md` for worked examples.

### Required behaviors

1. **Idempotent.** Running a scraper twice on the same day must not duplicate data. Use `INSERT ... ON CONFLICT DO UPDATE` patterns. If unclear, write to a `raw_*` staging table first.

2. **Raw payload preservation.** Always store the unprocessed response (JSON, HTML, PDF text) in a `raw_payload` JSONB column alongside the normalized fields. When the schema evolves, we can re-parse without re-fetching.

3. **Structured logging.** Use Python `logging` with JSON formatter. Every scraper logs: `{scraper, started_at, finished_at, status, records_in, records_inserted, records_updated, errors}`.

4. **Fails loudly.** On error, write to a `scraper_runs` table (add in a later task) and exit non-zero. Cron captures this.

5. **Respectful pacing.** GFW API: max 1 req/sec. IDXCarbon: 1 req / 5 sec when scraping their site. Verra CSV downloads: cache the file locally for 24h to avoid re-downloads.

6. **Entry point convention.** Each scraper exposes `python -m scrapers.<source>.fetch` with optional flags `--since YYYY-MM-DD`, `--dry-run`, `--limit N`.

### Cron schedule (v0.1)

Installed on the VPS at `/etc/cron.d/karbonlens`:

```
# m  h    dom mon dow  user       command
  0  2    *   *   1    karbonlens /opt/karbonlens/scrapers/scripts/run_weekly_verra.sh
  0  3    *   *   1    karbonlens /opt/karbonlens/scrapers/scripts/run_weekly_gfw.sh
  0  4    1   *   *    karbonlens /opt/karbonlens/scrapers/scripts/run_monthly_idxcarbon.sh
  0  5    *   *   1    karbonlens /opt/karbonlens/scrapers/scripts/run_weekly_digest.sh
  0  6    *   *   *    karbonlens /opt/karbonlens/scrapers/scripts/run_daily_score.sh
```

Every script:
- Activates the venv at `/opt/karbonlens/scrapers/.venv`
- Sources `/opt/karbonlens/.env`
- Runs the Python module
- Appends stdout/stderr to `/var/log/karbonlens/<scraper>.log`
- Rotates logs weekly via logrotate

---

## 5. Data source contracts

### 5.1 Verra Registry (weekly, Mondays 02:00 Asia/Jakarta)

- **Source:** `https://registry.verra.org/app/search/VCS/Registered+project` with filter `Country = Indonesia`
- **Access method:** HTML scraping. Verra's registry search page is stable HTML. No official API for public use.
- **Expected records:** ~40 Indonesian VCS projects at v0.1 launch
- **Fields extracted:** project ID (VCS####), name, developer, AFOLU type, hectares, status, methodology, validation date, first issuance date, crediting period, VCU totals, developer contact
- **Secondary fetch:** for each project, the detail page `/app/projectDetail?id=XXXX` for richer metadata + centroid coordinates (when listed)
- **Write targets:** `projects`, `registries` (with `registry_name='Verra'`), `issuances`, `retirements`
- **Entity resolution:** before inserting, query `projects` for fuzzy match on `name_canonical`. If similarity > 0.85, skip insert and queue to `project_match_queue`.
- **Failure mode:** log error, retry next run. Don't block other scrapers.

### 5.2 GFW Integrated Alerts API (weekly, Mondays 03:00)

- **Source:** `https://data-api.globalforestwatch.org/dataset/gfw_integrated_alerts/latest/query/json`
- **Access method:** REST API with `x-api-key` header
- **API key:** free, register at `https://www.globalforestwatch.org/help/developers/`. Store in `.env` as `GFW_API_KEY`. Renews annually.
- **Workflow per project:**
  1. Build GeoJSON polygon from centroid + 10km buffer
  2. POST to `/geostore` to get a `gfw_geostore_id`
  3. GET `/dataset/gfw_integrated_alerts/latest/query/json?sql=SELECT * FROM data WHERE date >= '2026-01-01'&geostore_id=<id>`
  4. Parse response, filter for `confidence >= nominal`, write to `satellite_alerts`
- **Rate limit:** 1 req/sec per API key
- **Expected volume:** 50–500 alerts per project per year in active regions
- **Write targets:** `satellite_alerts`
- **Post-processing:** intersect each alert location with project buffer geometry; set `inside_project_buffer` accordingly. Cluster alerts within 3 days + 50m into single notification entry (to avoid bell spam).
- **Notification trigger:** any new alert with `inside_project_buffer=true` creates a row in `notifications` for all users who have that project on their (future) watchlist. For v0.1, notify all logged-in users for all flagship (top 10) projects' alerts.

### 5.3 IDXCarbon monthly reports (monthly, 1st of month 04:00)

- **Source:** `https://idxcarbon.co.id/data-monthly` (PDF listings)
- **Access method:** scrape listing page for PDF URLs, download each, parse with pdfplumber
- **Expected records:** one new monthly report per month
- **Fields extracted:** period_month, total_volume_tco2e, total_value_idr, total_transactions, trading_days, registered_participants, registered_projects, available_units, retired_units, avg_price_idr
- **Parser strategy:** PDFs are templated. Use pdfplumber to extract text, regex to pull named values. When a new format appears (annually), fail loudly so it can be handled manually.
- **Write targets:** `idx_monthly_snapshots`
- **Archive:** save raw PDF to `/var/lib/karbonlens/pdf-archive/YYYY-MM.pdf` on first fetch. Never re-download.

### 5.4 Regulatory events (manual curation for v0.1)

- Not a scraper in v0.1
- Seeded with ~10 events at launch (Permenhut 6/2026, Perpres 110/2025, Verra MRA, etc.)
- Andy adds new events via direct SQL or a simple admin page as they happen
- v0.2 automates via Kemenhut / JDIH scrapers

### 5.5 News mentions (manual curation for v0.1)

- Not in scope for v0.1
- v0.2 adds RSS + scrapers for Mongabay, Kompas, Tempo, Jakarta Post

---

## 6. Next.js API routes

All routes live under `app/api/`. All return JSON. All server-side fetched from Drizzle against Postgres.

| Method | Path | Purpose | Auth |
|---|---|---|---|
| GET | `/api/projects` | List projects, with filters | public (limited) / authed (full) |
| GET | `/api/projects/[id]` | Single project with score, issuances, alerts | public (limited) / authed (full) |
| GET | `/api/prices/idxcarbon` | IDXCarbon historical snapshots | authed |
| GET | `/api/alerts` | Current user's notification inbox | authed |
| POST | `/api/alerts/mark-read` | Mark notification as read | authed |
| GET | `/api/regulatory` | Regulatory events timeline | public |
| GET | `/api/map/projects` | GeoJSON FeatureCollection of all projects for map | public (limited) / authed (full) |
| POST | `/api/digest/send` | Manually trigger weekly digest (dev only) | admin |
| GET | `/api/digest/cron` | Weekly digest cron target | shared-secret header |

### Public vs authenticated data boundary
- Public users see the 3 featured projects (Katingan, Sumatra Merang, Rimba Raya) in full
- Public users see the projects list but only top-level data (name, type, province, score) — no issuance detail, no news, no alerts
- Authenticated users see all 40+ projects fully
- Unauthenticated calls to authenticated endpoints return 401

---

## 7. Environment variables

All in plain `.env` files. Three environments: local dev (`.env.local`), staging (VPS `/opt/karbonlens/.env`), production (same VPS initially, separate box later). Netlify env vars for frontend.

```bash
# Database
DATABASE_URL=postgresql://karbonlens:xxx@localhost:5432/karbonlens

# NextAuth
NEXTAUTH_URL=https://karbonlens.netlify.app
NEXTAUTH_SECRET=<openssl rand -base64 32>
GOOGLE_CLIENT_ID=<from Google Cloud Console>
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>

# External APIs
GFW_API_KEY=<from globalforestwatch.org>
RESEND_API_KEY=<from resend.com>

# Scraper config
SCRAPER_USER_AGENT="KarbonLens/0.1 (+https://karbonlens.id)"
SCRAPER_LOG_DIR=/var/log/karbonlens

# Digest cron
DIGEST_CRON_SECRET=<shared secret for /api/digest/cron>

# Feature flags (optional)
ENABLE_MAP_VIEW=true
ENABLE_EMAIL_DIGEST=true
```

`.env.example` is committed. Real `.env` files are gitignored. On the VPS, the file is owned by `karbonlens:karbonlens` with mode 600.

---

## 8. Score methodology v1

This is the v0.1 implementation. It is explicitly a framework, not a final formula. Weights live in `lib/score.ts` as constants and are intended to be iterated.

```typescript
// lib/score.ts

export const SCORE_WEIGHTS_V1 = {
  validationRecency: 0.25,
  reversalRisk: 0.35,
  communityFlags: 0.20,
  transparency: 0.20,
} as const;

export function computeIntegrityScore(p: ProjectScoreInputs): ProjectScore {
  return {
    integrityScore: Math.round(
      p.validationRecencyScore * SCORE_WEIGHTS_V1.validationRecency +
      p.reversalRiskScore     * SCORE_WEIGHTS_V1.reversalRisk +
      p.communityFlagsScore   * SCORE_WEIGHTS_V1.communityFlags +
      p.transparencyScore     * SCORE_WEIGHTS_V1.transparency
    ),
    // ... components
  };
}
```

### Component definitions

**Validation recency** (0–100, higher = better):
- Last validation < 3 years ago → 90–100
- 3–5 years → 60–89
- 5–8 years → 30–59
- >8 years or unknown → 0–29

**Reversal risk** (0–100, inverted: higher = less risk):
- No alerts in last 90 days inside project buffer → 90–100
- 1–5 nominal alerts → 70–89
- 6–15 alerts or any high-confidence → 40–69
- >15 alerts or active fire clusters → 0–39

**Community flags** (0–100, inverted: higher = fewer flags):
- For v0.1 with no news scraper, default to 75 for all projects, override manually for known-problematic ones (Rimba Raya, Aru)
- v0.2 computes from scraped news sentiment

**Transparency** (0–100):
- Dual registry (Verra + SRN-PPI) → 85
- Single registry with public PDD → 70
- Single registry with sparse public data → 50
- Known opacity issues → <40

Scores computed daily by `scrapers/scripts/run_daily_score.sh` → writes to `project_scores` table.

---

## 9. Notification & digest pipeline

### In-app bell (real-time-ish)
- When a scraper creates a new `notifications` row for a user, the user sees it next time they load any page (unread count in the bell icon, via `/api/alerts` endpoint)
- No WebSockets, no push — polling on page load is fine for v0.1

### Weekly digest (Mondays 09:00 Asia/Jakarta)
- Cron on VPS hits `https://karbonlens.netlify.app/api/digest/cron` with shared secret
- The endpoint:
  1. Queries `notifications` for all users where `digested_at IS NULL AND created_at > now() - interval '7 days' AND email_digest_opt_in = TRUE`
  2. Groups by user
  3. Renders digest email (React Email template) per user
  4. Sends via Resend
  5. Updates `notifications.digested_at`
- Template: top 5 notifications, one-line each, link back to KarbonLens
- Unsubscribe link sets `users.email_digest_opt_in = FALSE`

---

## 10. Operational notes

### Staging vs production
- For v0.1, staging and production are the same Hetzner CX32. "Staging" means `feature/` branches deploy to Netlify preview URLs. Production is `main` → karbonlens.netlify.app.
- When traffic warrants, promote database to a larger Hetzner box (CPX31 or similar), keep the frontend on Netlify (no reason to self-host that).

### Backups
- `pg_dump` runs nightly via cron, gzipped, to `/var/lib/karbonlens/backups/YYYY-MM-DD.sql.gz`. Keep 14 days.
- Weekly: rsync backups to a separate Hetzner Storage Box (€4/mo, 1TB). Off-site.

### Monitoring (v0.1 is minimal)
- Scraper success/failure: check `/var/log/karbonlens/*.log` manually. Automate with Healthchecks.io in v0.2.
- Database: no monitoring beyond `htop`. Add Prometheus + Grafana when there are paying customers.
- Frontend: Netlify analytics (built in, free).
- Errors: Sentry (free tier) added in Task 3.

### Security basics
- Postgres: listen only on `localhost` + Tailscale private interface. Frontend connects via SSH tunnel or Tailscale, not public IP.
- SSH: key-only, no password auth, fail2ban enabled.
- Google OAuth restricted to `profile` + `email` scopes. No domain restriction for v0.1 (open to anyone), but track user `persona` so we can segment later.

---

## 11. Conventions and style

- **Python:** 3.12, `uv` for package management, `ruff` for lint + format, type hints on public functions only
- **TypeScript:** strict mode on, no `any`, prefer server components over client where possible
- **SQL:** snake_case columns, plural table names, explicit foreign keys with `ON DELETE` specified
- **Git:** feature branches off `main`, squash merge, conventional commits optional but preferred
- **Commit messages:** tense doesn't matter, content does
- **No automated tests for v0.1.** Iterate manually. Add pytest for scrapers and Playwright for frontend when v0.2 starts.

---

## 12. Open questions to revisit post-v0.1

These do not block v0.1 but should be revisited:

- [ ] When to split scrapers into their own repo
- [ ] Whether to add TimescaleDB for `idx_transactions` once we have daily data flowing
- [ ] Whether to move from Netlify to self-hosted when we need more API flexibility
- [ ] What the paid Pro tier unlocks beyond "more projects" — API access, raw data export, alert customization, priority email support
- [ ] Whether to build paperclip / openclaw integrations for scraper orchestration or stick with cron
- [ ] What additional data buyers will pay for that we can't get cheaply (carbon stock estimates, offtake gossip, CA authorization status)

---

---

## 13. Implementation notes — shipped state (as of 2026-04-21)

Deltas between what the architecture specified and what Phase 1 actually shipped. §1–§12 above remain the forward-looking reference; this section records divergences.

- **Next.js version:** §1 diagram labels "Next.js 15"; shipped Next.js 16 (App Router semantics unchanged, per T03 implementation report). No functional impact.
- **Tailwind version:** §2 repo layout references `tailwind.config.ts`; that file does not exist. Tailwind v4 uses CSS-first `@theme` blocks in `app/globals.css`. There is no `tailwind.config.ts`.
- **Drizzle adapter field-name contract:** after T04's post-audit fix, the `accounts` table Drizzle definition uses snake_case JS keys (`refresh_token`, `access_token`, `expires_at`, `token_type`, `id_token`, `session_state`) because `@auth/drizzle-adapter` v1.11.2 reads them by those exact names. `users.emailVerified` stays camelCase (adapter expects that). SQL column names in §3 are all snake_case and are unchanged.
- **Adapter table binding:** NextAuth is configured with an explicit table map (`usersTable`, `accountsTable`, `sessionsTable`, `verificationTokensTable`). The adapter's auto-detect looks for singular names (`user`, `account`, …); our plural schema names (`users`, `accounts`, …) require the explicit map.
- **Route group layouts:** `app/(public)/layout.tsx` and `app/(app)/layout.tsx` are passthrough wrappers (no `<html>` / `<body>`). Root `app/layout.tsx` owns the document shell, fonts, and providers.
- **Table ownership:** all 15 tables in migration 001 are owned by the `karbonlens` Postgres role (not `postgres`), so future `ALTER TABLE` migrations applied by the scraper user succeed without superuser escalation.
- **Netlify deploy:** deferred. v0.1 runs local-only on the Hetzner box. Connectivity strategy (Tailscale / VPS proxy / managed Postgres migration) is undecided. Tracked as **OQ-1** in `docs/stories/reports/T04-implementation-report.md`.
- **pg_hba.conf ordering:** scram-sha-256 rule for the karbonlens role was inserted BEFORE any catch-all trust lines (first-match-wins). The runbook (`docs/runbooks/vps-setup.md`) documents this ordering requirement. Non-issue on a fresh host; documented for multi-tenant safety.
- **`users.email_verified`:** §3 DDL shows `email_verified TIMESTAMPTZ` — this is correct and matches what shipped. No change needed.

### Phase 2 shipped state (as of 2026-04-21)

Deltas introduced by T06–T10. Section §1–§12 remain forward-looking; §13 Phase 1 block and this block record divergences.

- **Migration 002 (T07):** adds `projects.gfw_geostore_id TEXT` plus three expression-based unique indexes: `uq_sat_project_date_loc` on `satellite_alerts`, `uq_issuances_dedupe` on `issuances`, and `uq_notifications_dedupe` on `notifications`. **Critical gotcha:** `ON CONFLICT ON CONSTRAINT <name>` fails against expression-based unique indexes because they are not named constraints. All three scrapers must use the column-list form `ON CONFLICT (col_a, col_b, ...)` instead. See `docs/scraper-patterns.md` §ON-CONFLICT for the worked pattern.

- **T06 Verra — OData, not HTML (§5.1 update):** §5.1 above describes the registry as "stable HTML scraping." This is outdated. The registry SPA is an Angular app; the documented search URLs return a Next-shell only. T06 reverse-engineered the internal OData endpoints: `/uiapi/resource/resource/search` (project list), `/uiapi/resource/resourceSummary/{id}` (project detail), `/uiapi/asset/asset/search` (issuances). These endpoints are anonymous-accessible but undocumented. Treat them as fragile — a Verra SPA upgrade may change paths without notice.

- **T07 GFW geostore cache:** GFW's `/geostore` POST endpoint accepts anonymous (keyless) requests in practice, even though the query endpoint requires a key. This allowed 55 of 64 project buffers to be pre-registered without a key. The remaining 9 will be registered when Phase B runs with `GFW_API_KEY`. Phase B then queries all 64 for integrated alerts.

- **T08 IDXCarbon archive cap:** The listing page at `idxcarbon.co.id/data-monthly` exposes only the 10 most recent months (currently Jun 2025 – Mar 2026). The PRD's ≥24-month AC-2 threshold is environmentally unreachable until IDXCarbon expands their archive. Future monthly cron runs will pick up new months as they publish. Historical months pre-Jun 2025 are not recoverable from the current public listing.

- **T09 scoring caveats:**
  - `validation_date` in the DB equals Verra's `registration_date`, not the PDD validation date. The API does not expose the PDD date. Scores using validation recency reflect registration age, which is a reasonable proxy.
  - `transparency_score` floors at 55 for most projects because T06 writes raw Verra status strings (e.g. "Registered") rather than the canonical enum (`active`). T09's transparency sub-score filter checks `status='active'` — the mismatch causes all non-overridden projects to land in the single-registry path. T06.1 will normalize the status field before T11 frontend lands.
  - Community overrides: 1 of 3 hardcoded slugs matches T06's actual slug output. The other 2 (`rimba-raya`, `cendrawasih-aru`) need Andy to confirm they match the slugified names in the `projects` table.
  - Score range: min=56, max=86, median=74 across 64 projects.

- **T10 regulatory seed:** 10 events loaded. Rows 1–5 confirmed clean; rows 6–10 (Permenhut 7/2024, Kepmen LH 20/2025, Perpres 110/2025, Permenhut 6/2026, IDX 2026-07-01 forecast) await Andy's verification of document numbers and dates.

- **Current table counts (live DB, 2026-04-21):**
  - projects=64, registries=64, issuances=307, satellite_alerts=0 (Phase B pending)
  - idx_monthly_snapshots=10, regulatory_events=10, project_scores=64
  - projects with gfw_geostore_id=55, users=1 (Andy's Google account), sessions=1, accounts=1

*End of architecture doc. Paired with `PRD.md` (strategy) and `TASKS.md` (tactics).*
