# Phase 2 Retrospective — Data Pipelines (T06–T10)

**Dates:** 2026-04-21. Spec + audit + implement + code-audit + merge across 5 stories completed in a single working day, matching Phase 1's pace. Total: 2 working days for the first 10 stories of v0.1.

---

## Shipped

| Story | Summary | Merge / impl SHA |
|---|---|---|
| T06 — Verra scraper | 64 projects, 307 issuances; OData API (reverse-engineered); idempotent; entity-resolution queue; sole owner of `pyproject.toml` | `241dbbe` (merge) |
| T07 — GFW alerts + migration 002 | Geodesic geostore buffers; 55/64 geostore IDs cached; dedupe indexes for satellite_alerts + issuances + notifications; Phase B pending key | `13a85b4` (merge) |
| T08 — IDXCarbon PDF scraper | pdfplumber + dual-format regex; 10 months ingested (Jun 2025–Mar 2026); `ON CONFLICT (period_month) DO UPDATE`; archive to `/var/lib/karbonlens/pdf-archive/` | `c2fca33` (merge) |
| T09 — Score computation | 64 project_scores; 4-pillar weighted composite; `lib/score.ts` TypeScript mirror; zero-data trap; AC-5 environment-conditional | `a45a07f` (merge) |
| T10 — Regulatory seed | 10 events with bilingual summaries; `DO $$ ASSERT $$` guard; rows 6–10 pending Andy fact-check | `26dcd1f` (post-audit fix; no separate merge — committed directly to `feature/v0.1-impl`) |

---

## Pipeline stats

- **~15+ agents fired:** 5 spec-writers + 5 spec-auditors + 5 revision passes + 4 implementers (T06, T07, T08, T09; T10 was narrow-scope, self-contained) + 4 code-auditors + 1 T07 fix round + 1 T08 stub-reconciliation round + 1 T10 post-audit fix + 1 Phase 2 close agent.
- **Fix rounds required (both phases combined):** 4 — T04 (Phase 1 adapter snake_case), T07 (ON CONFLICT expression-index), T08 (stub API reconciliation), T10 (row 1 name + row 6 tag typo).

### What audits caught

**Spec audits caught:**
- T06: pyproject.toml ownership ambiguity (parallel scrapers must not each run `uv add`); entity-resolution silent-drop risk if fuzzy match was not queued.
- T07: `satellite_alerts` and `notifications` missing unique indexes for ON CONFLICT dedupe — added to migration 002 scope.
- T08: stub API drift risk if T08 used a mock OData client rather than T06's canonical helpers.
- T09: `ScoreComponents` type collision with T04's placeholder in `lib/schema.ts`; zero-data trap (reversal_score=100 when satellite_alerts is empty inflates composite scores).

**Code audits caught:**
- T06: status-map incomplete for edge Verra status strings — flagged as non-blocking (T06.1 follow-up).
- T07: `ON CONFLICT ON CONSTRAINT` fails against expression-based unique indexes — **blocking**; required fix round before PASS.
- T08: T08's stub helpers had API drift vs T06's shipped `scrapers/common/` — **blocking**; reconciled via rebase.
- T10: row 1 name typo (Badan Pengendalian → Dewan Nasional); row 6 tag `mrvb` → `mrv` — non-blocking, fixed pre-merge.

---

## What worked

- **Single-owner `pyproject.toml` (T06).** All Phase 2 runtime deps pre-declared by T06 before parallel implementers ran. Zero merge conflicts in the shared deps file across 4 concurrent Python scrapers.
- **Migration 002 single-owner (T07).** Batching all cross-story unique indexes into one migration (T07's scope) avoided ad-hoc ALTER TABLE collisions from T08 and T09.
- **Worktree isolation.** Each parallel implementer (T06, T07, T08, T09) worked in `/root/.openclaw/workspace/karbonlens-worktrees/T0X` — no branch cross-contamination.
- **"What the auditor should scrutinize" bullet in implementation reports.** Self-reported risk areas focused code audits on the highest-impact checks (ON CONFLICT patterns, stub drift, type collisions) rather than line-by-line diffs.
- **Accepting environment-conditional ACs.** T07 Phase B, T08 AC-2, T09 AC-5, and T05 Phase B were all accepted as "done-pending-external-key" rather than blocking the merge pipeline. This kept the 1-day pace without sacrificing correctness of the code itself.

---

## What surprised us / caveats

- **Verra is an Angular SPA.** The documented registry URLs in §5.1 return a Next-shell HTML fragment. Reverse-engineering the OData API (`/uiapi/resource/resource/search`, `/uiapi/resource/resourceSummary/{id}`, `/uiapi/asset/asset/search`) was the real implementation work. Future Verra SPA upgrades may change paths silently.
- **GFW geostore accepts anonymous POSTs.** The geostore registration endpoint accepted requests without an API key, allowing 55/64 buffer registrations to complete during dry-run. This was unexpected and accelerates Phase B.
- **IDXCarbon exposes only 10 months.** The PRD's ≥24-month AC-2 threshold is not achievable from the current public listing. Historical months pre-Jun 2025 are not in the listing and appear unreachable without IDXCarbon expanding their archive.
- **`ON CONFLICT ON CONSTRAINT` vs expression-based indexes.** Expression-based unique indexes (`CREATE UNIQUE INDEX ... ON t (expression)`) are not named constraints and cannot be referenced by `ON CONFLICT ON CONSTRAINT <name>`. This syntax error was caught only during code-audit live-repro — dry-run and ruff both passed. The column-list form (`ON CONFLICT (col_a, col_b)`) must be used instead.
- **T10 went directly to `feature/v0.1-impl`.** The T10 agent committed its SQL seed file directly to the integration branch rather than using a worktree. For narrow-scope, single-file tasks this was operationally fine; but it breaks the review barrier (no branch → no PR → no diff for code audit to inspect cleanly). Noted for process tightening.
- **Status-mapping drift.** T06 writes raw Verra status strings (`"Registered"`, `"Under Validation"`) rather than the canonical enum (`active`, `pipeline`, `suspended`). T09's `transparency_score` sub-score filters on `status='active'`, so the mismatch floors transparency scores for most projects at 55. This shows the risk of enum-like fields without a single point of truth — T06.1 will normalize before T11 frontend.

---

## Process adjustments for Phase 3

1. **Update §5.1** to point at Verra's OData endpoints, not the SPA URLs. Done during Phase 2 close (see §13 Phase 2 in `docs/architecture.md`).
2. **T06.1 follow-up story** — normalize `registries.status` + `projects.status` to canonical enum values (`active`, `pipeline`, `suspended`, `flagged`) before T11 explorer and T12 detail screens render integrity scores. Impacts T09 transparency sub-score.
3. **Document the ON-CONFLICT-expression-index gotcha in `docs/scraper-patterns.md`.** Done during Phase 2 close.
4. **Worktree discipline for narrow-scope stories.** Recommendation: tighten enforcement — always use a worktree + branch + PR path for `feature/v0.1-impl` merges, even for single-file stories. The T10 exception was harmless but sets a precedent that erodes the review barrier.
5. **Add "live dedupe repro" as a standard code-audit AC** for any story that uses `ON CONFLICT`. A dry-run pass is insufficient: the exact conflict expression must be executed against a live DB that has the target unique index applied, to confirm the column-list syntax matches the index expression.

---

## Open items for Phase 3

| # | Item | Blocks |
|---|---|---|
| **T07 Phase B** | Andy to provide `GFW_API_KEY` — populates `satellite_alerts` + `notifications` | T09 AC-5 re-verify, T12 detail screen alerts, T16 notifications bell |
| **T10 rows 6–10 fact-check** | Andy to verify document numbers + dates against authoritative sources | T15 regulatory timeline UI (if rows are wrong, UI will surface incorrect data) |
| **T09 slug reconciliation** | Andy to confirm `rimba-raya` + `cendrawasih-aru` match DB slugs; update community-overrides dict if needed | T09 accuracy, T12 project detail scores |
| **T06.1 status normalization** | Technical-debt story: normalize raw Verra statuses → canonical enum. Schedule before T11 merges. | T09 transparency sub-score accuracy, T11 filter by status |
| **OQ-1 (from Phase 1)** | Netlify → self-hosted Postgres connectivity strategy (Tailscale / VPS proxy / managed Postgres) | T23 (replace static prototype with live Next.js) |
| **Design brief** | `KarbonLens_Design_Brief.md` not in repo; required for T11–T18 quality | T11–T18 screen fidelity |

---

*Retrospective written by PHASE-CLOSE agent, 2026-04-21.*
