# KarbonLens — v0.1 handoff

## Current status (2026-04-21)

**Phase 1 + Phase 2 complete.** T01–T10 all done (with deferred items noted below).

**Phase 2 status:** T06 (Verra) fully done. T07 Phase A complete — geostore cache (55/64 projects) + dedupe infrastructure live; Phase B (live alert ingestion) pending `GFW_API_KEY` from Andy. T08 done — 10 months ingested; IDXCarbon source caps the ≥24 AC. T09 done with AC-5 environment-conditional (re-verifies automatically when T07 Phase B runs). T10 done with rows 6–10 pending Andy fact-check. T05 Phase B is now LIVE VERIFIED (Google OAuth round-trip confirmed 2026-04-21). Ready for Phase 3 after checkpoint.

**Outstanding deferred items for Andy before Phase 3:**
1. **GFW_API_KEY** — provide key so T07 Phase B can ingest live satellite alerts and T09 AC-5 re-verify.
2. **T10 fact-check** — verify rows 6–10 document numbers/dates against authoritative sources (affects T15 regulatory timeline UI if incorrect).
3. **T09 slug reconciliation** — confirm `rimba-raya` and `cendrawasih-aru` match DB slugs (or update the community-overrides dict in `scrapers/scoring/compute.py`).

See [`docs/retros/phase-1.md`](retros/phase-1.md) and [`docs/retros/phase-2.md`](retros/phase-2.md) for retrospectives, and [`CHANGELOG.md`](../CHANGELOG.md) for per-story details.

This folder contains the complete v0.1 handoff package for KarbonLens: the Indonesian carbon market intelligence platform.

## Read order

**If you are Claude Code or a new engineer, read these in order:**

1. **`PRD.md`** (10 min) — what we're building and why. Strategy, scope, success criteria. Stable.
2. **`docs/architecture.md`** (20 min) — how the system is shaped. DB schema, scraper patterns, env vars, API contracts. Technical reference.
3. **`TASKS.md`** (scan, then deep dive per task) — the working playbook. 23 numbered tasks, ordered, with acceptance criteria. This is where day-to-day work happens.

**If you are Andy:**
- `PRD.md` is the stable doc for sharing with investors/advisors/co-founder.
- `TASKS.md` is your working list — update statuses as you go.
- `docs/architecture.md` changes slowly; keep it the source of truth for tech decisions.

## Design brief — embedded

No separate design-brief document exists for v0.1. The **legacy static prototype at `legacy/prototype/`** is the canonical design source of truth. Everything below is extracted from `legacy/prototype/styles.css` and `legacy/prototype/index.html` — if anything here contradicts the prototype, the prototype wins. T03 already ported these tokens into `app/globals.css` as Tailwind v4 `@theme` variables; T11–T18 consume them.

### Design philosophy

- **Terminal, not marketing site.** Dense, data-first, analyst-grade. No gradients, no hero animations, no glassmorphism.
- **Typography hierarchy via weight + size, never uppercase body text.** Uppercase only for 11 px section labels with 0.5 px letter-spacing.
- **Tabular numerics everywhere numbers appear.** `.tnum { font-variant-numeric: tabular-nums; }` — scores, prices, hectares, dates.
- **Sentence case for titles** ("Projects explorer", not "PROJECTS EXPLORER" or "Projects Explorer").
- **Borders over shadows.** 0.5 px hairlines (`--border`) separate surfaces; no box-shadows.
- **Radii:** 6 px for inline chips/pills, 8 px for cards (`--radius-md`), 12 px for dialogs (`--radius-lg`), 16 px for hero surfaces (`--radius-xl`).

### Tokens (from `legacy/prototype/styles.css` `:root`)

```css
/* Backgrounds */
--bg:         #FAFAF7;  /* page background — warm off-white */
--surface:    #FFFFFF;  /* cards, top nav */
--surface-2:  #F1EFE8;  /* hover states, subtle fills */

/* Borders */
--border:         rgba(0,0,0,0.08);  /* default hairline */
--border-strong:  rgba(0,0,0,0.14);  /* emphasized dividers */

/* Text */
--text:    #1A1A1A;  /* primary */
--text-2:  #5F5E5A;  /* secondary — labels, subtitles */
--text-3:  #888780;  /* tertiary — meta text */

/* Semantic (bg pairs with matching fg) */
--info-bg:     #E6F1FB;   --info-fg:     #185FA5;   /* blue */
--success-bg:  #E1F5EE;   --success-fg:  #0F6E56;   /* green */
--warning-bg:  #FAEEDA;   --warning-fg:  #854F0B;   /* amber */
--danger-bg:   #FCEBEB;   --danger-fg:   #A32D2D;   /* red */

/* Chart palette — use in this order for multi-series */
--chart-blue:  #378ADD;
--chart-teal:  #1D9E75;
--chart-coral: #D85A30;
--chart-amber: #BA7517;
--chart-red:   #E24B4A;
```

### Typography

- **Font stack:** `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif`. No webfont download — system-first for speed.
- **Base body size:** 13 px, `line-height: 1.5`.
- **Page title:** 22 px, weight 500, `letter-spacing: -0.2px`.
- **Page subtitle:** 13 px, `color: --text-2`.
- **Section label:** 11 px, uppercase, `letter-spacing: 0.5px`, weight 500, color `--text-2`.
- **Body weights:** 400 (regular), 500 (semibold for nav-active, titles, buttons). Never 600/700 — keeps the terminal-density aesthetic.

### Layout

- **Page max-width:** 1200 px, padding `24px 24px 60px`.
- **Top nav:** 52 px tall, sticky, 0.5 px bottom border, `background: --surface`. `max-width: 1200px` inner, flex row, 24 px gap.
- **Nav links:** `padding: 6px 10px; border-radius: 6px; font-size: 13px; color: --text-2`. Active state: `color: --text; background: --surface-2`.
- **Cards:** `background: --surface; border: 0.5px solid --border; border-radius: --radius-md`. No drop shadow.
- **Spacing rhythm:** 4 / 6 / 8 / 10 / 12 / 16 / 24 px. Prefer the smaller end.

### Status + signal colors (map from `projects.status`)

Use `lib/display/status.ts` (shared helper; T11 creates, T12 reuses):
- `active` → `--success-bg` / `--success-fg`
- `pipeline` → `--info-bg` / `--info-fg`
- `suspended` → `--warning-bg` / `--warning-fg`
- `flagged` → `--danger-bg` / `--danger-fg`
- unknown / null → `--surface-2` / `--text-2`

### Map (T13 visual rules)

- **Base tiles:** Esri World Imagery (satellite). Attribution `"Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics"` must be visible on-map.
- **Project markers:** 10 px circle, `--text` stroke 1 px, fill by score bucket: ≥80 `--chart-teal`, 60–79 `--chart-blue`, 40–59 `--chart-amber`, <40 `--chart-red`.
- **10 km project buffer:** 1 px stroke `--chart-blue`, fill `rgba(55, 138, 221, 0.1)`.
- **Alert points:** 4 px circles, color by confidence — high `--chart-red`, nominal `--chart-amber`, low `--text-3`. Cluster at zoom < 8 using MapLibre cluster feature; cluster badge uses `--surface` with `--border-strong` 0.5 px.

### Reference files

- `legacy/prototype/styles.css` — 1,601 lines of component styles. Refer here for exact spacing, pill shapes, table-row heights, tab styles, etc.
- `legacy/prototype/index.html` — ported screens (landing, projects, detail, prices, regulatory, alerts). `legacy/prototype/data.js` has the original mock shapes.
- `app/globals.css` — the v0.1 source of truth in runtime. If a token drifts between here and `legacy/prototype/styles.css`, `app/globals.css` wins and the legacy file is updated to match.
- `karbonlens-prototype.html` (outside repo, original zip) — superseded by `legacy/prototype/`.

## The three files in plain English

| File | Purpose | Changes how often | Audience |
|---|---|---|---|
| `PRD.md` | Why | Rarely | Andy, co-founder, investors |
| `docs/architecture.md` | How | When technical decisions evolve | Claude Code, engineers |
| `TASKS.md` | What next | Daily | Claude Code, Andy |

## Target timeline

- **Now → End of May 2026:** ship v0.1 per `TASKS.md`
- **June–July 2026:** v0.2 (Pro tier, SRN-PPI scraper, polygons, API, bilingual UI)
- **Q3 2026:** v0.3
- **Q4 2026:** v1.0 (brokerage advisory)

## Critical constraints to keep in mind

- Solo founder. No collaborators for v0.1. Claude Code is the co-worker.
- Hetzner CX32 for staging (will upgrade for production). PostgreSQL + PostGIS on same box.
- Netlify for frontend. Next.js 15 App Router. No separate backend repo.
- Python 3.12 for scrapers, in `/scrapers` directory of the same monorepo.
- All data sources for v0.1 are free: Verra (public HTML), GFW Data API (free key), IDXCarbon (public PDFs).
- Budget for paid services at v0.1: <$30/month (domain, Resend free tier, Sentry free tier, Netlify free tier).
- No automated tests for v0.1. Iterate manually.
- Google OAuth only (no email/password, no other providers).
- English-only UI chrome for v0.1. Bilingual content retained in regulatory + marketing surfaces.

## Getting started (day 1)

1. Clone the karbonlens repo locally.
2. Read the three core docs in order.
3. Start at `TASKS.md` T01 (VPS foundation). Works in parallel with T03 (Next.js bootstrap).
4. ~~By end of week 1: T01–T05 done, auth working, schema live.~~ **Done (2026-04-21).**
5. By end of week 2: T06–T10 done, data flowing, scores computed.
6. By end of week 3: T11–T18 done, frontend live with real data.
7. By end of week 4: T19–T23, ops hardening, v0.1 shipped.

Two-week buffer before end-of-May target date.
