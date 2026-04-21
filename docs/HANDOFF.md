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

## Related docs (outside this folder)

- `KarbonLens_Design_Brief.md` — visual design system: tokens, components, all 6 screen specs
- `KarbonLens_Design_Brief_Maps_Addendum.md` — map components, tile sources, layer specs
- `karbonlens-prototype.html` — the existing static prototype (reference only; being replaced by the Next.js rebuild in task T03)

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
