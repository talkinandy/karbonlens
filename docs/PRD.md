# KarbonLens — Product Requirements Document

**Version:** 0.2 (MVP handoff)
**Last updated:** April 20, 2026
**Status:** Active
**Owner:** Andy
**Target v0.1 ship date:** End of May 2026

---

## 1. Product

**What it is.** KarbonLens is a data intelligence platform for Indonesia's carbon market. It unifies project registries (Verra, SRN-PPI, Gold Standard), price signals (IDXCarbon), reversal alerts (GFW integrated alerts), and regulatory tracking into a single terminal.

**One-liner.** Bloomberg Terminal for Indonesian carbon.

**Why now.** Permenhut 6/2026 re-enabled forestry carbon credits after a four-year freeze. Perpres 110/2025 reopened international trade. IDX full-scale launch is coming mid-2026. International buyers are starting to shop Indonesian supply but have no unified intelligence layer to evaluate it. Every existing player (Sylvera, BeZero, AlliedOffsets) is built for the global VCM — none are Indonesia-native.

**What it is not.** Not an exchange (OJK monopoly). Not a project developer. Not an MRV tool. Not a tokenization platform. It is explicitly a read-only intelligence layer with a future path toward brokerage advisory.

---

## 2. Target users (v0.1 focus)

Three personas matter for v0.1. Others come later.

1. **International carbon buyer / broker** — Japanese trading houses, Singapore commodities desks, London retail brokers. Needs Indonesian supply visibility, price history, project integrity signals. Willingness to pay in v0.2: $500–2,000/mo. In v0.1: free tier user who we convert later.

2. **Indonesian corporate sustainability head** — ETS-regulated or CBAM-exposed companies (Astra, Pertamina, PLN, Unilever ID). Needs compliance tracking and supplier vetting. Willingness to pay in v0.2: $10–50K/yr.

3. **Climate researcher / journalist / NGO** — AMAN, Walhi, Mongabay, CIFOR-ICRAF, universities. Free tier forever in exchange for citations and credibility. Not a revenue target — they are the reputation engine.

Buyers come later once we have pricing and volume signal. Project developers are competitive-sensitive and we will not target them until v0.2.

---

## 3. Scope for v0.1

### In scope
- Next.js rebuild of the existing Netlify prototype, replacing mock data with live data
- Data pipelines for three sources: **Verra Registry**, **GFW Integrated Alerts**, **IDXCarbon monthly reports**
- PostgreSQL + PostGIS on Hetzner CX32, schema per `docs/architecture.md`
- Google OAuth login (NextAuth.js) with free-tier access control
- In-app notification bell + weekly email digest for logged-in users
- Six screens live: landing (public), projects explorer (table + map), project detail, price intelligence, regulatory timeline (manual entries), alerts inbox
- Interactive map on project detail + optional map tab on projects explorer, per maps addendum
- Score methodology v1 — framework only, weights configurable, not locked
- Manual entity resolution queue for duplicate projects across registries
- Staging on Hetzner CX32; production on a larger Hetzner box when traffic warrants

### Out of scope for v0.1 (deferred)
- Public API with keys and rate limits
- Pro tier + payments (Stripe/Midtrans)
- Real-time per-alert email
- Bilingual UI chrome (bilingual content stays; UI is EN-only)
- Telegram bot
- SRN-PPI scraper (high value but brittle — week 2+ or v0.2)
- Gold Standard Registry scraper
- Full regulatory scraper automation — curate ~10 events by hand for v0.1
- News scraper automation — curate high-profile items by hand for v0.1
- Weekly Substack digest (only in-app digest emails)
- Mobile-native app
- Team/multi-user accounts
- Bahasa Indonesia UI strings (keep bilingual content in regulatory + marketing surfaces only)
- Project polygon digitization — use centroid + 10km buffer radius as proxy

---

## 4. Success criteria for v0.1

Measurable outcomes that let us call v0.1 "done":

1. **Data freshness.** Verra, GFW, and IDXCarbon data for Indonesia refresh at their natural cadence (weekly, weekly, monthly respectively) without manual intervention for four consecutive weeks.
2. **Coverage.** At least 40 Indonesian carbon projects populated in the database with registry cross-references, score breakdown, and centroid geometry.
3. **Alert pipeline end-to-end.** A GFW integrated alert inside a project's 10km buffer triggers a notification in the in-app bell and is included in the next weekly digest email.
4. **Live prototype at karbonlens.com shows real data**, not mocks, for at least 10 flagship projects.
5. **Login works.** Google OAuth session persists, free-tier gating is enforced, unauthenticated users see public landing + limited data.
6. **Three external demos** delivered to prospects in the target personas — broker, corporate, researcher — with at least one positive follow-up conversation.

Non-goal for v0.1: revenue. That's v0.2.

---

## 5. Architecture at a glance

Full details in `docs/architecture.md`. Summary:

- **Frontend:** Next.js 15 App Router, TypeScript, Tailwind CSS v4, deployed to Netlify
- **Backend:** Next.js API routes in the same repo, called server-side from pages
- **Database:** PostgreSQL 16 + PostGIS on Hetzner CX32, accessed via Drizzle ORM
- **Scrapers:** Python 3.12 in a separate `/scrapers` directory, scheduled by cron on the VPS, writing directly to Postgres via psycopg
- **Auth:** NextAuth.js v5 with Google provider, sessions in Postgres
- **Maps:** MapLibre GL JS v5 with Esri World Imagery tiles (free)
- **Email:** Resend for the weekly digest (free tier covers v0.1)
- **Secrets:** Plain `.env` on the VPS for scrapers, Netlify environment variables for the frontend
- **CI/CD:** Frontend auto-deploys on push to `main`. Scrapers deploy by `git pull` on the VPS.

Explicit non-choices: no Redis, no queue system, no Docker orchestration, no TimescaleDB for v0.1, no separate backend repo.

---

## 6. Three product decisions worth flagging

These are the opinionated calls that shape the product. They will be debated; this is the current answer.

### 6.1 Score methodology is a framework, not a formula

The integrity score (0–100) is the most valuable and most controversial thing on the platform. In v0.1, we ship the scaffolding — four pillar scores (validation recency, reversal signal, community flags, transparency) combined with configurable weights — but do not lock the weights. This lets us iterate without versioning hell while we calibrate against buyer feedback. The score is visible from day one, labeled clearly as "v1 methodology, calibrating."

### 6.2 Polygons are proxied by centroid + buffer

Real project polygons are expensive to digitize (manual tracing from PDD PDFs) and gray-area to scrape (Nusantara Atlas). For v0.1, each project has a centroid coordinate and a 10km circular buffer serves as the geometry for satellite alert intersection. This is a simplification users should know about — we'll note it in the methodology page. v0.2 adds real polygons for the top 20 projects.

### 6.3 Entity resolution is human-in-the-loop

Rather than trusting fuzzy matching blindly or calling Claude for every ambiguous pair, the scrapers write candidate matches to a `project_match_queue` table. An admin UI (Andy only, Week 3) lets the human approve/reject. For v0.1, we expect ~40 projects, ~10–15 genuinely ambiguous matches. An afternoon of clicking handles the whole set.

---

## 7. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| SRN-PPI website changes structure mid-build | Low (deferred from v0.1) | Defer entirely to v0.2 |
| IDXCarbon stops publishing monthly PDFs publicly | Medium | Monthly archive scraped and stored in S3-compatible storage on first fetch |
| GFW API rate limits or key expires | Low | Key renews annually, request increase if needed, cache aggressively |
| Scorecard is wrong and an NGO calls us out | High reputation | Methodology page is transparent; weights configurable; every component visible |
| Polygon proxy (centroid + 10km) misclassifies alerts | Medium | Label the methodology clearly; v0.2 adds real polygons |
| Ten-day-to-demo mid-May expectation slips | Medium | Buffer of two weeks built in — target is end of May, demo-ready acceptable by mid-June |
| Scraper writes bad data to prod DB | Medium | Every scraper is idempotent; raw payloads saved to `raw_*` tables for replay |
| Solo-founder key-person risk | High (long-term) | Not a v0.1 concern; document everything, plan first hire for v0.2 |

---

## 8. Post-v0.1 roadmap (direction, not commitment)

- **v0.2 (June–July 2026):** Pro tier with Stripe, SRN-PPI scraper, polygon digitization for top 20 projects, public API, Telegram bot, Bahasa UI
- **v0.3 (Q3 2026):** Gold Standard, Nusantara-Atlas concession overlays, historical back-testing, corporate procurement tooling
- **v1.0 (Q4 2026):** OTC brokerage advisory, primary market tools (DRAM/DPP prep), integration with SBTi/CDP reporting
- **Year 2:** Regional expansion (Malaysia, Philippines, Vietnam), enterprise contracts, first hire

---

## 9. How this document is used

This PRD is stable. It changes when strategy changes, not when implementation changes.

- For **implementation tasks** (what to build next, in what order, with what acceptance criteria), see `TASKS.md`.
- For **technical detail** (schema, scraper patterns, env vars, API endpoints), see `docs/architecture.md`.
- For **design details** (tokens, components, screens), see `KarbonLens_Design_Brief.md` and `KarbonLens_Design_Brief_Maps_Addendum.md`.

If any of these docs contradict each other, the PRD wins for strategic questions and `docs/architecture.md` wins for technical questions.
