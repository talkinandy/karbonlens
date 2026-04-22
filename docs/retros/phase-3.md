# Phase 3 Retrospective — Frontend Integration (T11–T18)

**Dates:** 2026-04-21. All 8 stories plus 2 follow-ups (T05.1, T06.1) and 2 Phase-A splits completed in a single working day. Total: 3 working days for all 18 stories of v0.1 to date.

---

## Shipped

| Story | Summary | Merge SHA |
|---|---|---|
| T05.1 — proxy.ts + real slugs | `middleware.ts` → `proxy.ts` per Next.js 16 deprecation; real flagship slugs replacing spec placeholders | `f748a96` |
| T06.1 — Status normalization | Migration 003: Verra 17-status map + `CHECK` constraint; 29 falsely-suspended projects corrected | `bdedc7c` |
| T11 — Projects explorer | `/projects` wired to real DB; filters, sort, pagination, stats strip, `buildFilterUrl` helper, `lib/display/status.ts` | `312013a` |
| T12 — Project detail | `/projects/[slug]` with hero, score breakdown, issuance timeline, alerts, `badgePillClass`; status.ts union with T11 | `6cffc8e` |
| T13 — MapLibre integration | Satellite-map tab on `/projects?tab=map` + map panel on detail; Esri World Imagery; cluster + buffer + alert layers | `c55d929` |
| T14 — Price intelligence | `/prices` with dual-axis recharts chart, monthly aggregate table, MoM delta | inline (no separate merge SHA — landed directly on `feature/v0.1-impl`) |
| T15 — Regulatory timeline | `/regulatory` with year rails, bilingual EN/ID toggle, importance stripes, ministry + tag multi-select | `c1f68b9` |
| T16 — Notifications bell + inbox | `/alerts` paginated inbox, bell badge, `GET /api/notifications`, `POST /api/notifications/mark-read` | `4fcda4b` |
| T17 — Digest email Phase A | `POST /api/digest`, migration 004 (`digested_at` + partial index), XSS-hardened template, dry-run | `9f210da` |
| T18 — Landing with live stats | Dynamic `/` with auth-aware CTA, `lib/queries/landing-stats.ts`, `<StatCard>`, `<FeaturedProjects>`, `<HeroSection>` | `bb5b905` |

T14 has no separate merge commit; it was committed directly into `feature/v0.1-impl` by the implementer, bypassing the worktree isolation model. An inline audit was performed in lieu of the formal audit gate (all 8 ACs pass).

---

## Pipeline stats

- **~20+ agents fired:** spec-writers, spec-auditors, revision passes, implementers, code-auditors, fix rounds, and the phase-close agent across 10 story-sized units.
- **Fix rounds required this phase:** 3 — T18 CTA text + ISR decision (code-audit C-1/C-2); T17 idempotence via `digested_at` (F2 fix: migration 004 + query filter + route-handler call); T13 dev-scratch file cleanup (post-audit junk removal).
- **Discipline breaks:** 2 — T14 cherry-picked onto `main` directly (bypassing worktree + PR); T18 committed into the main tree on a branch before orchestrator rescued. Both worked out, but process drift is flagged.
- **Cross-story union:** `lib/display/status.ts` between T11 (created `displayStatus` + `DisplayStatus`) and T12 (added `badgePillClass`). Code-auditor enforced the merge; no duplication landed.

---

## What worked

- **T05.1 early in Phase 3.** Migrating `middleware.ts` → `proxy.ts` and reconciling real flagship slugs before any Phase 3 code locked in wrong public-slug assumptions prevented a wave of downstream audit failures.
- **T06.1 before T11/T12.** Status normalization (29 falsely-suspended → correct distribution) simplified the frontend: canonical enum only, no raw-Verra-string handling required in display components.
- **Worktree isolation + file-ownership maps.** Zero unresolvable merge conflicts across 8 parallel branches. Each implementer only touched its designated files.
- **Shared `buildFilterUrl` + `displayStatus` helpers.** Filter state and badge rendering were consistent across all screens that touched them; no URL-serialization drift between T11, T13, and T15.
- **Fact-check agent for T10.** Corrected 5 rows before T15 rendered bad data in the timeline. Two unverifiable events removed rather than shipped.
- **`markNotificationsDigested` gap caught at code-audit.** T17's helper existed but was never called in the route handler. The code-auditor flagged this as a blocking idempotence gap and required the F2 fix round (migration 004 + query filter + write-back call). Without the audit catch, every notification would have appeared in every future digest.

---

## What surprised us

- **T14 and T18 bypassed worktree isolation autonomously.** Both implementers committed directly against the main-branch tree rather than using an isolated worktree + PR. The orchestrator caught both cases, but it flags an implementer-prompt discipline gap that must be tightened before Phase 4.
- **Landing `auth()` CTA branch fundamentally conflicts with ISR.** Next.js cannot revalidate a page that reads session cookies per request. The T18 spec had originally called for `revalidate = 3600`; the code-audit required dropping it. Dynamic rendering was the only correct option, accepted for v0.1.
- **T12 audit raised a "middleware broken" alarm** that was actually the `PUBLIC_PROJECT_SLUGS` placeholder mismatch, not a broken auth flow. Good catch regardless — it directly led to T05.1 and the real-slug reconciliation.
- **Verra returned 11 distinct `resourceStatus` strings** (spec expected 4). Seven fell through to the `suspended` default, mislabelling 29 of 64 projects (45%). T06.1 fixed this with a 17-status map covering all globally-observed Verra values.
- **T13 implementer swept in dev-scratch files with `git add -A`.** The `_verify-map*.mjs` files were caught at code-audit and removed in a follow-up commit. Highlights the risk of blanket staging commands.

---

## Process adjustments for Phase 4

1. **Tighten implementer prompts:** "Your worktree is your scope. Do not cherry-pick, do not rebase onto main, do not commit outside the worktree. If you are tempted to do any of these, STOP and report to the orchestrator."
2. **Add a standard pre-commit gate in implementer prompts:** run `git status` before any commit; output should show only files listed in the story's §6 file-ownership map. Anything else triggers a stop-and-report, not a `git add -A`.
3. **Include explicit ISR-vs-dynamic confirmation in spec §3** for any page that reads session cookies. The question "does this page call `auth()` or read cookies?" must be answered in the spec before implementation starts, not discovered at audit.

---

## Open items for Phase 4

| # | Item | Blocks |
|---|---|---|
| **T17 Phase B** | Andy's `RESEND_API_KEY`; T19 then installs Monday 02:00 UTC cron | Weekly digest live send |
| **T19** | Cron entries: Verra weekly, GFW weekly, IDXCarbon monthly, score daily, digest weekly. Include logrotate config. | Automated data refresh |
| **T20** | `pg_dump` nightly + 14-day retention + restore drill | Data safety |
| **T21** | Entity-resolution admin page for `project_match_queue` (2 rows today; built ahead of v0.2 scraper growth) | Manual review workflow |
| **T22** | Sentry for Next.js server + client; free tier sufficient for v0.1 | Error visibility in production |
| **T23** | Replace Netlify static prototype with v0.1 app deploy | Blocked on OQ-1 (Postgres connectivity strategy — Tailscale / VPS proxy / managed Postgres — still undecided from Phase 1) |

---

*Retrospective written by PHASE-CLOSE agent, 2026-04-22.*
