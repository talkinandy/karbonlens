---
story: T10
auditor: adversarial-code-auditor
date: 2026-04-19
verdict: PASS-WITH-FIXES
blocking_findings: 0
advisory_findings: 5
andy_confirmation_required: 7
---

# T10 Code Audit — Seed regulatory events manually

## Verdict

**PASS-WITH-FIXES. 0 blocking findings, 5 advisory findings, 0 merge blockers.**

All AC queries pass. The SQL is structurally correct, idempotent, and self-validating. The `DO $$ ASSERT $$` block works as designed — tested adversarially: a deliberate importance typo triggers the assertion and rolls back the transaction. No code defects found that would block merge.

The "WITH-FIXES" qualifier applies entirely to **fact accuracy**: rows 6–10 contain post-knowledge-cutoff document numbers, dates, and descriptions that the implementer has correctly flagged and that Andy must confirm before the data is considered production-ready. This is a content gate, not a code gate. Andy's confirmation is required before the table is treated as authoritative source-of-truth for T15.

---

## Independent Verification — AC Table

All queries run as `sudo -u postgres psql -d karbonlens`. Idempotence re-run used `/tmp/` copy (postgres superuser cannot read from workspace path directly).

| AC | Query | Expected | Actual | Result |
|---|---|---|---|---|
| AC-1 | `SELECT COUNT(*) FROM regulatory_events` | 10 | **10** | PASS |
| AC-2 | Re-run seed (idempotence); count unchanged | 10, all `INSERT 0 0` | **10, all `INSERT 0 0`, exit 0** | PASS |
| AC-3 | `COUNT(*) WHERE summary_en IS NULL OR summary_id IS NULL` | 0 | **0** | PASS |
| AC-4 | `COUNT(*) WHERE event_date IS NULL OR ministry IS NULL OR title IS NULL OR importance IS NULL OR tags IS NULL` | 0 | **0** | PASS |
| AC-5 | `COUNT(*) WHERE is_upcoming = TRUE` | 1 | **1** | PASS |
| AC-5b | `event_date WHERE is_upcoming = TRUE` | >= 2026-06-01 | **2026-07-01** | PASS |
| AC-6 | `COUNT(*) WHERE importance = 'critical'` | >= 3 | **4** (rows 3,4,8,9) | PASS |
| AC-7 | `COUNT(*) WHERE 'forestry' = ANY(tags)` | >= 2 | **2** (rows 6,9) | PASS |
| AC-8 | `PGPASSWORD=<pw> psql -U karbonlens -h localhost ... COUNT(*)` | 10 | **10, exit 0** | PASS |
| AC-9 | Andy fact-check of summaries | human gate | **PENDING** (see §Fact-Check) | PENDING |

Schema match confirmed: `\d regulatory_events` output exactly matches architecture.md §3 — all 13 columns present with correct types (`tags TEXT[]`, `is_upcoming BOOLEAN DEFAULT FALSE`, `created_at TIMESTAMPTZ DEFAULT NOW()`).

---

## Adversarial Findings

### AF-1: `DO $$ ASSERT $$` Block — CONFIRMED WORKING (non-issue)

The assertion block is present at the end of the SQL file (lines 299–308). Adversarial test: patched one row's importance to `'critcal'` (typo) inside a transaction, then ran the assertion block. Result:

```
psql: ERROR:  regulatory_events.importance must be one of critical/high/medium/low
CONTEXT:  PL/pgSQL function inline_code_block line 3 at ASSERT
ROLLBACK
```

The assertion fires correctly and the transaction rolls back. With `--single-transaction`, this means any importance typo introduced in a future seed edit would roll back the entire file. **No defect.** The spec-audit advisory A-2 requested this block; it was implemented correctly.

**Important nuance**: the `DO $$ ASSERT $$` block does NOT assert only the 10 seed rows — it asserts over ALL rows in `regulatory_events`. This is the correct and stricter behaviour (catches any dirty data already in the table, not just newly inserted rows). This is a feature, not a bug.

### AF-2: Sentinel Dedupe Pattern for Rows 5 and 10 — CONFIRMED CORRECT

Both sentinel rows use the wider `(document_number, title, event_date)` compound key:

- Row 5 (`N/A`): `WHERE document_number = 'N/A' AND title = 'Peluncuran IDXCarbon — Bursa Karbon Indonesia' AND event_date = '2023-09-26'`
- Row 10 (`IDX-LAUNCH-2026`): `WHERE document_number = 'IDX-LAUNCH-2026' AND title = 'IDXCarbon Peluncuran Skala Penuh — Peserta Internasional' AND event_date = '2026-07-01'`

The switch from the standard `(document_number, ministry)` key to the three-field key is correctly annotated in inline SQL comments. Confirmed these exact predicates appear in the SQL file at lines 152–157 and 291–296 respectively. **No defect.**

Standard rows (1–4, 6–9) all use `(document_number, ministry)` dedupe. Cross-checked: no two rows share the same `(document_number, ministry)` combination, so no false-positive suppression risk.

### AF-3: NULL Tolerance — CONFIRMED CORRECT

`document_url` is NULL for rows 5, 6, 7, 8, 9, 10 — exactly as specified. Each NULL cell is annotated with an inline comment explaining why (no canonical URL at authoring time, or non-regulatory event). Rows 1–4 have non-null URLs pointing to BPK and OJK. No mandatory field (`event_date`, `ministry`, `title`, `importance`, `tags`) is NULL in any row. AC-4 query returns 0. **No defect.**

### AF-4: Array Column Syntax — CONSISTENT

The SQL file uses `ARRAY['tag1','tag2']` syntax throughout all 10 rows — never the `'{"tag1","tag2"}'` literal form. Both are valid PostgreSQL; using one form consistently is correct practice. Total tag vocabulary in DB: 30 distinct tags across 10 rows. **No defect.**

### AF-5: Bilingual Summaries — Row 3 Spot-Check (Perpres 98/2021)

English: "The cornerstone enabling regulation for Indonesia's carbon economy. Established the National Carbon Value (NEK) framework, mandated the SRN-PPI national registry, created the legal basis for voluntary and compliance carbon markets, and set the trajectory for a domestic carbon tax."

Indonesian: "Regulasi payung untuk ekonomi karbon Indonesia. Menetapkan kerangka Nilai Ekonomi Karbon (NEK), mengamanatkan registri nasional SRN-PPI, menciptakan dasar hukum pasar karbon sukarela dan wajib, serta membuka jalur menuju pajak karbon domestik."

The Indonesian text is genuine Indonesian (not machine-translated gibberish). Semantic alignment is correct: NEK = Nilai Ekonomi Karbon, SRN-PPI registry mandate present in both, voluntary and compliance market distinction preserved. Minor observation: the English uses "cornerstone enabling regulation" while the Indonesian says "Regulasi payung" (umbrella regulation) — a legitimate translatorial choice, not a factual discrepancy. **No defect; quality is acceptable.**

### AF-6: Process — Direct Commit to `feature/v0.1-impl` Without Worktree

T06 and T08 used dedicated worktrees (`karbonlens-worktrees/T06`, `karbonlens-worktrees/T08`). T10 committed directly to `feature/v0.1-impl` at the main workspace. This is a **process deviation, not a code defect**.

Commits `367dc19` and `1633045` are clean: each touches exactly one file (`scrapers/seed/regulatory_events_v1.sql` and `docs/stories/reports/T10-implementation-report.md` respectively), with no unintended scope. The scope of T10 (one SQL file, no code changes, no migration) made worktree isolation low-value for this story specifically.

However, the pattern of inconsistency is worth flagging: if a future story with wider blast radius (e.g., touching migrations + Next.js components simultaneously) skips worktree isolation, the risk is non-trivial. **Advisory: document in story conventions that worktree isolation is required when a story touches more than one subsystem (migrations, app code, scraper code). Pure-seed stories may be exempt.**

### AF-7: Cross-Story T15 Tag Vocabulary Risk

The seed introduces **30 distinct tag strings**. The T10 spec explicitly mandates (§6): "T15 **must** build its filter UI dynamically via `SELECT DISTINCT unnest(tags) FROM regulatory_events` — no hardcoded filter list."

This is a correct architectural decision confirmed by audit. The actual tag count (30) is higher than the "18 proposed" referenced in the spec, because the SQL uses four-tag arrays per row. Any T15 implementation that hardcodes even 18 tags will silently omit 12 currently active tags. **This is a pre-T15 advisory, not a T10 defect.**

---

## Fact-Check — All 10 Rows

Andy: the implementer correctly flagged these for your confirmation. The auditor independently assessed verifiability for each row. Post-knowledge-cutoff rows are assessed based on plausibility against the regulatory arc, not verified fact.

| # | Row | Auditor Assessment | Status |
|---|---|---|---|
| 1 | **Perpres 46/2008 — DNPI** | Date 2009-05-26 is plausible (Presidential Decree 46 of 2008 with 2009 effective date is a documented Indonesian legislative pattern). BPK URL provided. DNPI as "first formal national climate body" is accurately stated. `importance=medium` is appropriate. | Can verify via BPK URL — **awaiting Andy confirmation** |
| 2 | **Perpres 91/2016 — NDC Ratification** | Date 2016-10-24, document 91/2016. Indonesia ratified Paris Agreement 2016; Perpres 91 is widely cited. 29%/41% targets correct for the **first** NDC (Indonesia revised to 31.89%/43.2% in enhanced NDC 2022 — the row correctly describes the 2016 first NDC only). `importance=high` appropriate. BPK URL provided. | High confidence — **awaiting Andy confirmation** |
| 3 | **Perpres 98/2021 — NEK** | Date 2021-10-29, document 98/2021. Widely cited in public domain pre-cutoff. BPK URL provided. This is the most important enabling regulation in the seed; summary is substantively accurate. `importance=critical` correct. | High confidence — **awaiting Andy confirmation** |
| 4 | **POJK 14/2023 — IDXCarbon legal basis** | Date 2023-09-26, document 14/2023, OJK issuer. This matches the public record of IDXCarbon's launch-day regulatory package. OJK URL provided (long URL; whether it resolves correctly is worth checking). `importance=critical` correct. | High confidence — **awaiting Andy confirmation** |
| 5 | **IDXCarbon launch day** | Date 2023-09-26 matches public record. `document_number = 'N/A'` sentinel correctly used (no regulatory document number for a market launch event). "One of the first regulated carbon exchanges in Southeast Asia" — accurate as of 2023. Initial VCU/Verra restriction is correct. `importance=high`. | High confidence — **awaiting Andy confirmation** |
| 6 | **Permenhut 7/2024 — SRN-PPI operationalization** | Date 2024-07-08, document 7/2024, Kemenhut. This is **within potential knowledge cutoff range** but may be post-cutoff. The auditor cannot independently verify that Permenhut 7/2024 specifically operationalized SRN-PPI for the forestry sector (versus another Permenhut with a different number doing so). URL is NULL. `importance=medium` — the spec-audit questioned whether this should be `high` given SRN-PPI's critical role; auditor notes the medium rating is consistent with its operational (not enabling) nature. | **AWAITING ANDY CONFIRMATION — document number and date cannot be independently verified** |
| 7 | **Kepmen LH 20/2025 — DRAM/DPP** | Date 2025-03-15, document 20/2025, Kementerian LH. Post-knowledge-cutoff. Cannot verify that Kepmen 20/2025 from KLH specifically established the DRAM/DPP portals, or that those portal names are accurate acronym expansions. "Daftar Rencana Aksi Mitigasi" and "Data Pendukung Pemantauan" are plausible Indonesian MRV terminology. URL is NULL. `importance=medium`. | **AWAITING ANDY CONFIRMATION — document number, date, and portal names post-cutoff and unverifiable** |
| 8 | **Perpres 110/2025 — International carbon credit trade reopening** | Date 2025-04-22, document 110/2025, Presidential. Post-knowledge-cutoff. The auditor notes: as of the audit date (2026-04-19), this Perpres's date (2025-04-22) is approximately one year old and approximately 3 days from the current date in 2025. The document number (110/2025) and its characterization as re-opening international Article 6 trade cannot be independently verified. This is the highest-impact unverifiable row — a wrong document number here would misattribute a critical policy change. URL is NULL. `importance=critical`. | **AWAITING ANDY CONFIRMATION — CRITICAL ROW. Document number, date, and Article 6 specifics must be confirmed** |
| 9 | **Permenhut 6/2026 — Forestry moratorium lifted** | Date 2026-01-14, document 6/2026, Kemenhut. Post-cutoff. The auditor cannot verify that a forestry credit moratorium existed "since early 2022" (plausible given the regulatory context), that Permenhut 6/2026 specifically lifted it, or that the document number is correct. "Four-year moratorium" dating from early 2022 to January 2026 is approximately correct arithmetically. This is the second highest-impact unverifiable row. URL is NULL. `importance=critical`. | **AWAITING ANDY CONFIRMATION — CRITICAL ROW. Document number, moratorium start date, and lift scope must be confirmed** |
| 10 | **IDX full-scale launch — forecast** | Date 2026-07-01 (sentinel placeholder), `is_upcoming=TRUE`, `document_number='IDX-LAUNCH-2026'`. The SQL comment `/* forecast; update when announced */` is present on the event_date line. As of the audit date (2026-04-19), the 2026-07-01 forecast date is approximately 2.5 months away. The summary correctly states "Exact date subject to OJK rulemaking." The forecast date could be wrong; recommend Andy confirm "mid-2026" remains the expected timeframe as of today. Advisory: add a comment noting "forecast as of 2026-04-21" (implementer's report date) so future maintainers know when the forecast was made. | **AWAITING ANDY CONFIRMATION — forecast date currency** |

**Summary of fact-check status:**
- Rows 1–5: high confidence, pre-cutoff or verifiable from public record — still require Andy sign-off per DoD §8.
- Rows 6–9: post-cutoff, unverifiable by auditor — REQUIRED Andy confirmation before production use.
- Row 10: forecast, requires Andy confirmation that mid-2026 timeframe still current.

---

## Minor Code Observations (non-findings)

1. **Row 1 title mismatch**: The SQL inserts `title = 'Badan Pengendalian Perubahan Iklim (DNPI)'` but the actual institution is "Dewan Nasional Perubahan Iklim (DNPI)." "Badan Pengendalian" (Control Agency) vs "Dewan Nasional" (National Council) is a substantive difference. Andy should confirm the correct name. This may be a spec-carry-through error. **Flag for Andy as part of Row 1 confirmation.**

2. **Row 6 tag `mrvb`**: The tag is spelled `mrvb` (likely meant `mrv` — Measurement, Reporting and Verification). This is a minor tag typo. Not a schema error, but inconsistent with standard acronym usage. Andy may want to correct to `mrv` before T15 filter labels are written.

3. **Row 10 forecast comment placement**: The spec requires the forecast comment `/* forecast; update when announced */` on the event_date line. It is present: `'2026-07-01', /* forecast; update when announced */`. However, the outer SQL block comment does not mention the forecast-as-of date. Advisory: the implementer's report recommended documenting "forecast as of 2026-04-21" — this was not added to the SQL comment. Non-blocking.

---

## Process Note — Direct Commit to Main Tree

T06 and T08 used dedicated worktrees. T10 committed directly to `feature/v0.1-impl`. The commits are clean (one file each, no unintended changes). For this specific story scope (one SQL seed file, no migrations, no code), worktree isolation would have added friction without benefit.

**Recommendation**: codify an exemption in the story conventions: stories whose scope is limited to `scrapers/seed/` or `docs/` only, with no migration or application code changes, may commit directly to `feature/v0.1-impl`. All other stories should use worktrees. This prevents the pattern from being cargo-culted into riskier stories.

---

## Merge Recommendation

**Recommend merge with Andy fact-check of rows 6–10 completed.**

The code is correct. All AC queries pass. The seed is idempotent, self-validating, structurally sound, and consistent with the architecture. The `DO $$ ASSERT $$` block works correctly under adversarial conditions.

Merge should be gated on:
1. Andy confirming or correcting rows 6–10 document numbers, dates, and descriptions (rows 1–5 are lower priority but should also be signed off per DoD §8).
2. Andy deciding whether the title of Row 1 should read "Dewan Nasional Perubahan Iklim" or "Badan Pengendalian Perubahan Iklim."
3. Andy deciding whether tag `mrvb` (Row 6) should be corrected to `mrv`.

If Andy confirms rows 6–10 are accurate as written: merge immediately. If corrections are needed: apply via a brief fix commit (no new migration required — UPDATE or DELETE + re-run the seed with corrections).

The T15 story must be briefed: use `SELECT DISTINCT unnest(tags) FROM regulatory_events` for dynamic filter options, not a hardcoded tag list. The current 30-tag vocabulary will grow.
