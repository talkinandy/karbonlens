# KarbonLens

> Indonesia's carbon market, in one terminal.
> *Pasar karbon Indonesia dalam satu layar.*

## What is KarbonLens?

KarbonLens is a carbon-market intelligence terminal that reconciles SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace for developers, corporates, banks, and regulators tracking the Indonesian voluntary carbon market. It surfaces project integrity scores, satellite-based reversal alerts, IDXCarbon price history, and the regulatory timeline — all derived from public data sources, updated automatically.

## Status

**v0.1 Phase 1 complete + Phase 2 Phase-A complete (2026-04-21).** Foundation (T01–T05) and data pipelines (T06–T10) are merged into `feature/v0.1-impl` at HEAD `a45a07f`. Phase B items pending Andy's external keys/data: T07 Phase B (GFW_API_KEY — satellite alerts ingestion), T09 AC-5 re-verify (auto-resolves after T07 Phase B), T10 rows 6–10 fact-check. Ready for Phase 3 (frontend integration) after checkpoint.

**Live DB:** 64 projects · 307 issuances · 10 IDXCarbon monthly snapshots · 10 regulatory events · 64 project scores · 55/64 gfw_geostore_id cached · 0 satellite alerts (Phase B pending)

- Sprint overview and task statuses: [`docs/TASKS.md`](docs/TASKS.md)
- What shipped in each story: [`CHANGELOG.md`](CHANGELOG.md)
- Phase 1 retrospective: [`docs/retros/phase-1.md`](docs/retros/phase-1.md)
- Phase 2 retrospective: [`docs/retros/phase-2.md`](docs/retros/phase-2.md)

## Quickstart (local dev)

**Prerequisites:**
- Node 22+, npm 10+
- PostgreSQL 16 + PostGIS 3 (see [`docs/runbooks/vps-setup.md`](docs/runbooks/vps-setup.md) for the install procedure used on the Hetzner box)
- Google OAuth credentials — optional for Phase-A workflows; required for full sign-in flow (see [`docs/runbooks/google-oauth-setup.md`](docs/runbooks/google-oauth-setup.md))

```sh
# 1. Install dependencies
npm install

# 2. Copy env template
cp .env.example .env.local
# Edit .env.local:
#   DATABASE_URL=postgresql://karbonlens:<password>@localhost:5432/karbonlens
#   NEXTAUTH_SECRET=<openssl rand -base64 32>
#   NEXTAUTH_URL=http://localhost:3000
# GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are optional until you need sign-in

# 3. Start the dev server (Turbopack)
npm run dev
# → http://localhost:3000
# Note: on the Hetzner VPS, port 3000 is occupied by Gitea — use :3001 instead.

# 4. Health check
curl http://localhost:3000/api/health
# → {"ok":true,"db":"connected"}
```

### Scrapers (Python 3.12)

- `scrapers/verra/` — weekly Indonesia VCS registry ingest (public OData API reverse-engineered from the Angular SPA). 64 projects in DB.
- `scrapers/gfw/` — weekly deforestation alerts from Global Forest Watch. Needs `GFW_API_KEY` (see `docs/runbooks/gfw-api-key.md`). Phase B pending.
- `scrapers/idxcarbon/` — monthly PDF scraper. 10 months ingested (Jun 2025 – Mar 2026; IDXCarbon listing exposes only 10 months at a time).
- `scrapers/scoring/` — daily score compute. 64 project_scores rows. AC-5 (Rimba Raya range) environment-conditional until T07 Phase B populates satellite alerts.
- `scrapers/seed/regulatory_events_v1.sql` — 10 hand-curated regulatory events (rows 6–10 pending Andy fact-check).

Running a scraper locally:

```sh
cd /root/.openclaw/workspace/karbonlens
source scrapers/.venv/bin/activate   # or: uv run ... from scrapers/
python -m scrapers.verra.fetch --dry-run --limit 3
```

### Routes (Phase 1 — mock data, auth wired)

| Route | Source |
|---|---|
| `/` | `app/(public)/page.tsx` — landing |
| `/projects` | `app/(app)/projects/page.tsx` |
| `/projects/katingan-peatland` | `app/(app)/projects/[slug]/page.tsx` |
| `/prices` | `app/(app)/prices/page.tsx` |
| `/regulatory` | `app/(app)/regulatory/page.tsx` |
| `/alerts` | `app/(app)/alerts/page.tsx` |

All pages currently read from `lib/mock-data.ts`. T11+ swaps the imports for Drizzle queries against live Postgres.

## Architecture

Full details: [`docs/architecture.md`](docs/architecture.md)

- **Frontend:** Next.js 16 App Router, deployed on Netlify (deploy deferred — see below)
- **Styling:** Tailwind v4 CSS-first with design tokens in `app/globals.css`
- **Database:** PostgreSQL 16 + PostGIS on Hetzner CX32 VPS, Drizzle ORM for TypeScript schema
- **Auth:** NextAuth v5 with Google OAuth provider, sessions in Postgres via `@auth/drizzle-adapter`
- **Scrapers:** Python 3.12 in `scrapers/`, managed with `uv`, scheduled via cron (T06+)
- **Schema:** 15 tables in `scrapers/migrations/001_init.sql` — projects, registries, issuances, retirements, IDXCarbon snapshots, satellite alerts, regulatory events, scores, auth tables, notifications
- **Score methodology:** weighted composite of validation recency, reversal risk, community flags, transparency (v1 weights in `lib/schema.ts` comments; computation added in T09)

## Repo layout

```
app/                     Next.js App Router
  (public)/              public routes (landing)
  (app)/                 protected routes (projects, prices, regulatory, alerts)
  api/                   API routes
  globals.css            Tailwind v4 + design tokens
  layout.tsx             root layout (owns <html>, <body>, fonts)
components/              shared React components
  site-nav.tsx
  auth/                  SignInButton, UserMenu, SignOutButton, OnboardingModal
  ui/                    design-system primitives
  map/                   MapLibre wrappers (T13)
lib/
  db.ts                  Drizzle singleton client
  schema.ts              Drizzle schema (TypeScript, mirrors migration 001)
  auth.ts                NextAuth config
  mock-data.ts           seeded UI data; replaced in T11+
scrapers/
  migrations/            SQL migration files (001_init.sql)
  (T06+)                 Python scrapers
docs/                    PRD, architecture, story specs, runbooks, retros
legacy/prototype/        original static HTML/CSS/JSX prototype (reference only)
```

See [`docs/architecture.md`](docs/architecture.md) §2 for the full annotated layout.

## How work is organised

Stories flow through a pipeline:

1. **Spec** — story written in `docs/stories/T0X-<slug>.md` with Gherkin ACs
2. **Spec audit** — auditor agent reviews the spec for contract gaps, then spec is locked
3. **Implementation** — implementer agent writes code in an isolated git worktree
4. **Code audit** — auditor reviews the diff against the spec ACs
5. **Merge** — merge commit to `feature/v0.1-impl` after audit PASS

Full pipeline doc: [`docs/stories/README.md`](docs/stories/README.md) (if present); story specs and reports live under `docs/stories/`.

## Deploy

v0.1 runs **local-dev only** on the Hetzner VPS. Netlify deploy is deferred pending a Postgres-connectivity strategy decision: connecting Netlify to the self-hosted Postgres requires either Tailscale, a VPS-side proxy, or migrating to a managed Postgres provider. This is tracked as open question **OQ-1** in the T04 implementation report (`docs/stories/reports/T04-implementation-report.md`).

## Design

Restraint-first, editorial. No gradients, no drop-shadows, no emoji in product UI.

- **Type:** Instrument Serif (display) · IBM Plex Sans (body) · IBM Plex Mono (labels, tabular values)
- **Palette:** Base `#FAFAF7` · Brand teal `#0F6E56` · Text `#1A1A1A` / `#5F5E5A`
- **Elevation:** 0.5 px hairlines only (no shadows)

Indonesian regulatory and place-name terms are kept verbatim: Permenhut, Perpres, POJK, Kepmen, Padiatapa, SRN-PPI, IDXCarbon, BPDLH, etc.

## Legacy static prototype

The original static HTML/JSX prototype lives under `legacy/prototype/` for design reference.

```sh
cd legacy/prototype && python -m http.server 8000
# → http://localhost:8000
```

## License / contact

Prototype — internal use. Contact: andy@fmg.co.id.
