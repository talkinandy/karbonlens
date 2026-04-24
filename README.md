# KarbonLens

> Indonesia's carbon market, in one terminal.
> *Pasar karbon Indonesia dalam satu layar.*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

KarbonLens is an open carbon-market intelligence terminal for the Indonesian
voluntary carbon market. It reconciles registry records (Verra, IDXCarbon),
satellite-based forest-loss alerts (Global Forest Watch / GLAD-S2), and
Indonesian climate regulation into a single searchable workspace — all
derived from public data sources, updated automatically.

**Live at [karbonlens.com](https://karbonlens.com).**

## Status

**v0.1 released 2026-04-24.**

- 200+ projects indexed
- 307 issuances, 10 IDXCarbon monthly price snapshots
- 247k satellite forest-loss alerts cross-linked to project polygons
- 10 curated regulatory events (bilingual EN / ID)
- Auto-published weekly Market Wrap at [`/news`](https://karbonlens.com/news)

## Architecture at a glance

- **Frontend**: Next.js 16 App Router, self-hosted on a Hetzner CX32
  alongside the database. `karbonlens-app.service` on port 3010 behind
  nginx + Let's Encrypt.
- **Database**: PostgreSQL 17 + PostGIS 3. Drizzle ORM for the TypeScript
  schema (`lib/schema.ts`).
- **Auth**: NextAuth v5 with Google OAuth; sessions stored in Postgres
  via `@auth/drizzle-adapter`.
- **Map**: MapLibre GL JS v5 with Esri World Imagery tiles.
- **Styling**: Tailwind v4 CSS-first with design tokens in
  [`app/globals.css`](app/globals.css).
- **Ingestion** (scrapers, cron orchestration, GLAD-S2 pipeline) lives in
  a companion repository; this repo contains the application layer that
  reads the ingested data.

Full architecture document: [`docs/architecture.md`](docs/architecture.md).

## Quickstart (local dev)

**Prerequisites:**

- Node 22+, npm 10+
- PostgreSQL 17 + PostGIS 3 (see
  [`docs/runbooks/vps-setup.md`](docs/runbooks/vps-setup.md) for the
  install procedure used on the production box)
- Google OAuth credentials — optional for read-only browsing; required for
  sign-in. See
  [`docs/runbooks/google-oauth-setup.md`](docs/runbooks/google-oauth-setup.md).

```sh
# 1. Install dependencies
npm install

# 2. Copy env template and fill in secrets
cp .env.example .env.local
#   DATABASE_URL        postgres://...
#   NEXTAUTH_SECRET     openssl rand -base64 32
#   NEXTAUTH_URL        http://localhost:3000
#   GOOGLE_CLIENT_ID    (optional until you need sign-in)
#   GOOGLE_CLIENT_SECRET
#   ADMIN_EMAILS        comma-separated allowlist for admin routes

# 3. Apply schema
npx drizzle-kit push

# 4. Start the dev server
npm run dev

# 5. Health check
curl http://localhost:3000/api/health
# → {"ok":true,"db":"connected"}
```

## API surface

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Public | Database connectivity check |
| `GET` | `/api/notifications` | Session | Notification list or `?countOnly=true` unread count |
| `POST` | `/api/notifications/mark-read` | Session | Mark notifications read (`{ids}` or `{all:true}`) |
| `POST` | `/api/digest` | Cron secret | Render and send weekly digest (`?dryRun=true` for preview) |

## Scheduled jobs (production)

On the production box, jobs run under a dedicated `karbonlens` system user
on the same Hetzner CX32 as the app and database:

| Schedule (UTC) | Job |
|---|---|
| Daily 02:00 | `pg_dump` backup |
| Daily 02:30 | Nightly IndexNow delta-ping |
| Mon 03:00 | Verra registry scraper |
| Mon 03:30 | GFW satellite alerts scraper |
| 1st of month 04:00 | IDXCarbon monthly PDF scraper |
| Daily 04:00 | Project score computation |
| Sun 05:00 | `pg_restore` drill |
| Mon 00:00 | Weekly digest email |
| Mon 06:00 | Weekly Market Wrap publisher |

The application service talks to Postgres over the loopback; deploys are
`rsync` + `npm run build` + `systemctl restart`. Runbooks for each
operational concern live in [`docs/runbooks/`](docs/runbooks/).

## Public routes

| Route | Auth | What |
|---|---|---|
| `/` | Public | Dynamic landing with live DB stats |
| `/news` | Public | Auto-published weekly Market Wrap |
| `/regulatory` | Public | Indonesian carbon regulation timeline, bilingual |
| `/projects` | Gated (flagship slugs public) | Table + map of indexed projects |
| `/projects/[slug]` | Gated | Score breakdown, issuance timeline, map, alerts |
| `/prices` | Gated | IDXCarbon price history |
| `/alerts` | Gated | Satellite-alert inbox |

Three flagship projects are accessible without sign-in:
`katingan-peatland-restoration-and-conservation-project`,
`sumatra-merang-peatland-project-smpp`,
`rimba-raya-biodiversity-reserve-project`. All other project detail and
list pages redirect to sign-in.

## Repository layout

```
app/                   Next.js App Router
  (public)/            public routes
  (app)/               protected routes (projects, prices, regulatory, alerts)
  api/                 API routes
  globals.css          Tailwind v4 + design tokens
  layout.tsx           root layout
components/            shared React components
  auth/                sign-in, user menu, onboarding modal
  ui/                  design-system primitives
  map/                 MapLibre wrappers
lib/
  db.ts                Drizzle singleton client
  schema.ts            Drizzle schema
  auth.ts              NextAuth config
  admin.ts             admin allowlist + isAdmin helper
drizzle/               generated Drizzle metadata
docs/
  PRD.md               product requirements
  architecture.md      architecture reference
  runbooks/            operational how-tos
legacy/prototype/      original static prototype (reference only)
```

## Design

Restraint-first, editorial. No gradients, no drop-shadows, no emoji in
product UI.

- **Type**: Instrument Serif (display) · IBM Plex Sans (body) · IBM Plex
  Mono (labels, tabular values)
- **Palette**: Base `#FAFAF7` · Brand teal `#0F6E56` · Text `#1A1A1A` /
  `#5F5E5A`
- **Elevation**: 0.5 px hairlines only (no shadows)

Indonesian regulatory and place-name terms are kept verbatim: Permenhut,
Perpres, POJK, Kepmen, Padiatapa, SRN-PPI, IDXCarbon, BPDLH, and so on.

## Contributing

Contributions welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md) for
development setup, the DCO sign-off requirement, and the pull-request
checklist.

Security issues: please report privately per [`SECURITY.md`](SECURITY.md).

## Data sources

KarbonLens presents public data from carbon registries and open Earth
observation services. See [`NOTICE`](NOTICE) for the full attribution
list. Upstream terms of use apply to the underlying records; the
aggregated dataset compiled by this project is available under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
