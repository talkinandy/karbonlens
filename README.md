# KarbonLens

> Indonesia's carbon market, in one terminal.
> *Pasar karbon Indonesia dalam satu layar.*

## What is KarbonLens?

KarbonLens is a carbon-market intelligence terminal that reconciles SRN-PPI, IDXCarbon, Verra, Gold Standard, Sentinel (RADD / VIIRS / NDVI), and JDIH into a single workspace for developers, corporates, banks, and regulators tracking the Indonesian voluntary carbon market. It surfaces project integrity scores, satellite-based reversal alerts, IDXCarbon price history, and the regulatory timeline — all derived from public data sources, updated automatically.

## Status

**v0.1 Phases 1–4 complete (2026-04-21).** Foundation (T01–T05), data pipelines (T06–T10), frontend integration (T11–T18), and ops hardening (T19–T22) are all merged into `feature/v0.1-impl`. Only T23 (replace static prototype with v0.1 app) remains — blocked on OQ-1 (Netlify → self-hosted Postgres connectivity strategy).

**Live DB:** 64 projects · 307 issuances · 10 IDXCarbon monthly snapshots · 8 regulatory events · 64 project scores · 247,004 satellite alerts · 60 in-app notifications

**Deferred items:** T17 Phase B (live Resend send) pending Andy's `RESEND_API_KEY`; T22 Phase B (live Sentry capture) pending Andy's `SENTRY_DSN`; T23 (Netlify cutover) pending OQ-1 Postgres-connectivity decision.

- Sprint overview and task statuses: [`docs/TASKS.md`](docs/TASKS.md)
- What shipped in each story: [`CHANGELOG.md`](CHANGELOG.md)
- Phase 1 retrospective: [`docs/retros/phase-1.md`](docs/retros/phase-1.md)
- Phase 2 retrospective: [`docs/retros/phase-2.md`](docs/retros/phase-2.md)
- Phase 3 retrospective: [`docs/retros/phase-3.md`](docs/retros/phase-3.md)
- Phase 4 retrospective: [`docs/retros/phase-4.md`](docs/retros/phase-4.md)

## Running the scheduled jobs

Scrapers and cron wrappers are live on the Hetzner box under the `karbonlens` user.

- **Scrapers source:** `/opt/karbonlens/scrapers/` (rsynced from repo on install via `scripts/install-crontab.sh`)
- **Wrappers:** `/opt/karbonlens/scripts/` (owned by `karbonlens`, all +x)
- **Cron entries:** installed under the `karbonlens` user — inspect with `sudo crontab -u karbonlens -l`
- **Logs:** `/var/log/karbonlens/*.log` (logrotate weekly, keep 4 weeks compressed)
- **Backups:** `/var/lib/karbonlens/backups/*.dump` (pg_dump custom-format, 14-day rotation)
- **Environment:** `/opt/karbonlens/.env` (mode 640, owner `karbonlens:karbonlens`) — populated with real `DATABASE_URL`, `PGPASSWORD`, `GFW_API_KEY`, `DIGEST_CRON_SECRET`; `RESEND_API_KEY` and `SENTRY_DSN` remain `CHANGE_ME` until Andy supplies them

Active cron schedule (as of 2026-04-21):

| Schedule | Job |
|---|---|
| Mon 03:00 | Verra registry scraper |
| Mon 03:30 | GFW satellite alerts scraper |
| 1st of month 04:00 | IDXCarbon monthly PDF scraper |
| Daily 04:00 | Project score computation |
| Mon 00:00 | Weekly digest email (Phase A; live send awaits RESEND_API_KEY) |
| Daily 02:00 | pg_dump backup (Andy must append from `scrapers/scripts/pg-cron.conf`) |
| Sun 05:00 | pg_restore drill (Andy must append from `scrapers/scripts/pg-cron.conf`) |

T23 (Netlify production deploy) is deferred pending OQ-1 — the Netlify → self-hosted Postgres connectivity strategy (Tailscale / VPS proxy / managed Postgres). Until OQ-1 is resolved, the app runs on the Hetzner box only.

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

### Live screens (Phase 3 — real data)

| Route | Source | Auth |
|---|---|---|
| `/` | `app/(public)/page.tsx` — dynamic landing (auth-aware CTA: "Sign in with Google" unauthed, "Open dashboard →" authed); live DB stats via `lib/queries/landing-stats.ts` | Public |
| `/projects` | `app/(app)/projects/page.tsx` — table + map tab; filters, sort, pagination, CSV export | Gated (3 flagship slugs public) |
| `/projects/[slug]` | `app/(app)/projects/[slug]/page.tsx` — hero, score breakdown, issuance timeline, MapLibre panel, alerts | Gated (3 flagship slugs public) |
| `/prices` | `app/(app)/prices/page.tsx` — dual-axis recharts chart + monthly aggregate table | Gated |
| `/regulatory` | `app/(app)/regulatory/page.tsx` — chronological timeline, bilingual EN/ID, ministry + tag filters | Public |
| `/alerts` | `app/(app)/alerts/page.tsx` — notifications inbox, bell badge, mark-read | Gated |

**5 flagship slugs accessible without sign-in:** `katingan-peatland-restoration-and-conservation-project`, `sumatra-merang-peatland-project-smpp`, `rimba-raya-biodiversity-reserve-project`. All other project detail and list pages redirect to sign-in.

**Map:** MapLibre GL JS v5 with Esri World Imagery (free satellite tiles, attribution `"Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"` visible on-map).

**Notifications:** bell with unread count badge in top nav; `/alerts` inbox live. Digest email is Phase A only (code + migration 004 for `digested_at` idempotence + XSS-hardened template + dry-run verified); Phase B (live Gmail send) awaits Andy's `RESEND_API_KEY`.

### API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | DB connectivity check |
| GET | `/api/notifications` | Session | Notification list or `?countOnly=true` unread count |
| POST | `/api/notifications/mark-read` | Session | Mark notifications read (`{ids}` or `{all:true}`) |
| POST | `/api/digest` | Cron secret | Render + send weekly digest (`?dryRun=true` for preview) |

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
