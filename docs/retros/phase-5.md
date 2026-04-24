# Phase 5 Retrospective — Polish + SEO/GEO (T24–T33)

**Dates:** 2026-04-22 to 2026-04-24. Three working days for ten stories across polish, mobile, AI descriptions, technical SEO, programmatic hubs, and automated content cadence.

---

## Shipped

| Story | Summary | Merge SHA |
|---|---|---|
| T24 — Dead-link audit + `/methodology` page | `/methodology` explains the four integrity-score pillars with thresholds matching `lib/score.ts` exactly; architecture §8 rewritten; 5 internal-link audit passes | `acb2797` |
| T25 — Landing redesign (editorial split hero) | Replaced stat-card landing with legacy-prototype editorial split: hero + map + ticker + four-pipeline section + featured projects + personas | `2b4df2f` |
| T26 — Social preview (OG + Twitter) | Site-wide metadata + per-project dynamic OG/Twitter images via `app/(app)/projects/[slug]/opengraph-image.tsx` | (landed pre-T31) |
| T27 — Sign-in modal on gated routes | Modal replaces full redirect for better UX on `/alerts` and protected routes | `0002746` |
| T28 — Canonicalise provinces + collapse filter groups | Shared `lib/display/province.ts`; filter chips de-duplicate between canonical and raw names | `bd3e0d3` |
| T29 — Mobile at 375px + 768px | Every v0.1 surface usable at phone + tablet widths; cards for mobile, tables for desktop | `49cb3da` |
| T30 — AI-researched project descriptions | `project_descriptions` table (migration 006); gated analyst briefing behind sign-in; fingerprint-based refresh candidates | `97a7f32` |
| T31 — Technical SEO + answer-first templates + admin dashboard | JSON-LD across Article / BlogPosting / BreadcrumbList / Organization; `/admin/seo` dashboard; `/llms.txt` + `/llms-full.txt`; IndexNow scaffolding | `5daf82b` |
| T32 — Programmatic hubs + glossary + monthly prices | `/projects/by-{province,methodology,registry,developer}` index + slug pages; `/glossary`; `/prices/[month]` detail | `a3d6b45` |
| T33 — Automated content cadence | Nightly IndexNow delta-ping cron + weekly Market Wrap publisher cron; migration 007 (`news_posts`); `/news` index + `/news/[slug]` detail | `0540ac9` |

---

## What went well

- **The "hosts inside the same box" decision finally paid off.** Self-hosting the Next.js app on the same Hetzner CX32 as Postgres (OQ-1 resolved) meant T31–T33 could wire up server-side rendering, ISR, and cron-triggered publishers without any connectivity-proxy story. The nightly IndexNow job and weekly wrap publisher both hit the DB over loopback; no VPN, no managed-DB migration, no cross-service auth.
- **Four parallel agents for T33 Phase 4 was the right call.** Content composer, publisher script, public news surfaces, IndexNow nightly, and admin SEO dashboard all shipped in one pass with zero file collisions. Each agent reported typecheck-clean before returning; the integration step was just rsync + cron install + commit.
- **Deterministic composer beats LLM generation for the weekly wrap.** Every number in a published post traces back to a DB row, and the `facts_json` column captures the exact composer inputs. Re-rendering under a new template is a pure function call — no re-scraping, no hallucination risk, no content-moderation escape hatch needed.
- **The skip-guardrail avoided an obvious trap.** The wrap publishes only when at least one signal fires (≥5 alerts OR ≥1 issuance OR ≥1 regulation OR new price month). Empty-week filler posts would have been a direct Helpful-Content-Update hit; the guardrail is one function and a unit of discipline.

## What didn't

- **postgres-js silently refuses JS Date in raw `sql\`\`` templates.** Both T33 scripts threw `ERR_INVALID_ARG_TYPE` during Bind on the first dry-run. Typed drizzle operators handle Date fine, raw templates do not. Fixed by passing `.toISOString()` explicitly at every binding site. Memory saved; future scripts should use the ISO form by default.
- **`generateStaticParams` + the `(public)` layout = 500s on new slugs.** The news detail page initially used SSG with `generateStaticParams`, but the shared (public) layout reads session cookies for auth, tripping `DYNAMIC_SERVER_USAGE` on the prerender path. Fix: drop `generateStaticParams`, keep `revalidate = 3600` — matches the existing `/projects/[slug]` Dynamic + ISR pattern. This is the house rule now.
- **IndexNow cold-start is not a bug but felt like one.** First ping returned 422 "URLs not related to your site verified through the keylocation parameter" — key file served, env var set, URLs all on-domain. Root cause: Bing/Yandex refuse pings for a host they have not yet crawled. Resolution is out-of-band (submit sitemap to Bing Webmaster Tools). The cron remains safe to run; pings start landing post-baseline-crawl.
- **Netlify stubs still linger in PRD and architecture.md.** Netlify was our original frontend plan; we migrated to self-hosted at T23/OQ-1 but the older docs still reference `karbonlens.netlify.app` as the canonical URL. HANDOFF.md was updated in this phase; PRD and architecture.md remain as historical context. A v0.2 cleanup pass should rewrite them.

## Deferred into v0.2 backlog

- Bilingual (Bahasa Indonesia) /news stub — explicitly deferred during Phase-4 planning.
- SRN-PPI scraper — highest-value v0.2 story; blocks the "full Indonesian registry" claim.
- Playwright + pytest — no automated tests in v0.1; the per-story agent audits caught most regressions, but a v0.2 CI pipeline should formalise this.
- Public API + keys — Pro-tier gate.
- Substack weekly digest — parallel distribution channel for the /news posts.

---

## What v0.1 looks like at close (2026-04-24)

- **200 projects** across Verra / Gold Standard / CDM / SRN-PPI.
- **307 issuances**, ~22M VCUs issued, ~42k Rp/tCO₂e latest avg price.
- **10 monthly IDXCarbon snapshots** (the site only exposes 10).
- **10 regulatory events** hand-curated + kept current.
- **247k satellite alerts** ingested (T07 backfill pass).
- **20+ public routes**, all with JSON-LD structured data and canonical URLs.
- **One auto-published weekly Market Wrap** live at `/news`.
- **Nightly IndexNow pings** firing; unblock pending a Bing Webmaster baseline crawl.

v0.1 is ~35 days ahead of the end-of-May target.
