# T08 Spec Audit — IDXCarbon Monthly PDF Scraper

**Auditor:** adversarial spec-auditor agent
**Date:** 2026-04-19
**Story:** `docs/stories/T08-idxcarbon-pdf-scraper.md`
**Verdict:** CONDITIONAL PASS — 2 blocking issues, 4 non-blocking flags

---

## Blocking Issues

### B-1: `ON CONFLICT DO NOTHING` prevents ingesting corrected PDFs

`fetch_monthly.py` §3.2 step 4 skips a month if a row already exists (pre-check), and step 8 uses `ON CONFLICT (period_month) DO NOTHING`. Architecture §4 rule 1 explicitly says use `INSERT ... ON CONFLICT DO UPDATE` patterns. IDXCarbon does silently correct PDFs after publication (observed in similar exchange portals). With the current design, a corrected PDF is downloaded and re-parsed but the corrected values are never written to the DB. The archive file is also not overwritten (§3.2 step 5: "reuse cached copy"). This creates a silent data-staleness bug with no observable error.

**Fix:** Change the pre-check skip (step 4) to a re-parse-on-URL-change check, and change `DO NOTHING` to `DO UPDATE SET total_volume_tco2e = EXCLUDED.total_volume_tco2e, ..., scraped_at = NOW()` — or at minimum add a note documenting the deliberate deviation from arch §4 rule 1 and requiring Andy sign-off. Architecture §5.3 says "never re-download," which directly conflicts with arch §4 rule 1 for the correction case. This contradiction must be resolved in the spec.

---

### B-2: `total_volume_tco2e = 0` silently passes mandatory-field check but is semantically wrong

§7 edge-case table says `"0"` or `"-"` parses as 0 and `total_volume_tco2e = 0` is valid and should not raise `ParseError`. For months where the exchange genuinely had zero trading volume this is correct. However, the number-normalisation helper (§3.3) strips `Rp` and thousands separators before parsing — a regex that fails to match the volume field at all will return nothing, not `0`. If the implementer maps "no match" to `0` rather than `None`/raising `ParseError`, a broken regex silently inserts rows with `total_volume_tco2e = 0` for months that actually had volume. The spec does not distinguish "matched value of 0" from "failed match defaulting to 0." Mandatory field check must test for `None`, not for zero.

**Fix:** Clarify: `ParseError` is raised when the regex produces no match (field is `None`). A matched value of `0` is valid. This is a one-sentence addition to §3.3.

---

## Non-Blocking Flags

### NB-1: `pyproject.toml` bootstrap race with T06 (OQ-1) — already flagged but decision deferred

§9 OQ-1 delegates the landing-order question to Andy. T06 is marked `status: draft` and also `status: draft` for T08; either could land first in the sprint. The "check for file existence and branch accordingly" escape hatch in §3.1 is reasonable for an automated agent runner but produces a silent conflict if both agents run concurrently on the same worktree. The spec should specify the canonical resolution: T06 owns `pyproject.toml`, T08 appends only. Flag to Andy to confirm before sprint starts.

### NB-2: Partial-parse NULL policy is a deliberate compromise from arch §4 "fails loudly" — spec should say so explicitly

§3.3 allows NULL for non-mandatory fields and §7 confirms this. Architecture §4 says "fails loudly." The spec acknowledges this in §2 ("fail loudly per architecture §4") but does not call out that partial-parse NULLs are an explicit, scoped deviation. A single sentence — "this is a deliberate v0.1 scoping call; period_month and total_volume_tco2e are the minimum viable row; all other NULLs are acceptable" — would prevent an implementer from interpreting the architecture as requiring a stricter policy.

### NB-3: `avg_price_idr` computation path not resolved (OQ-5) — blocks AC-3 and AC-7

OQ-5 asks whether `avg_price_idr` is a direct PDF field or derived. AC-3 and AC-7 both assert a specific numeric range for this column. If the derivation path is wrong (e.g., field is direct and implementer derives it by dividing totals that are rounded differently), AC-3 fails. OQ-5 should be answered by the implementer inspecting a real PDF before any code is written, not after. Mark as a pre-implementation blocker within the story.

### NB-4: Architecture §5.3 says "never re-download" — contradicts §3.2 step 5 "overwrite on re-download only if file is absent"

These are equivalent in practice (both mean: don't re-download if cached). But the spec says "overwrite on re-download only if the file is absent; otherwise reuse cached copy," which means if the URL changes for the same month the scraper still uses the stale cached file. Combined with B-1 above, this creates a double-lock against ingesting corrections. Acceptable for v0.1 if deliberate; flag for explicit documentation.

---

## Cross-Story Concerns

- **T06 / T08 pyproject.toml ownership:** Both stories specify bootstrapping the Python project. T06 is the correct owner (earlier in phase, broader dep set). T08 should be listed as "append only." No story-level enforcement exists today.
- **T07 parallel:** T08 has no shared files with T07 (confirmed). No conflict.
- **T19 (cron installation):** T08 provides the shell script; T19 wires it into `/etc/cron.d/karbonlens`. T08's cron line in §3.5 matches the architecture §4 schedule exactly. No drift.
- **T14 / T18 (downstream consumers):** Both depend on `avg_price_idr` being non-NULL. NB-3 is therefore a downstream risk.

---

## PDF Format Strategy Assessment

The two-branch regex approach (old format 2023-2024 / new format 2025+) is correctly specified. The spec enumerates concrete field anchors and alias variants for both families, defines the format-detection probe (`table-header string`), and specifies the month-name static mapping in full. This is implementation-ready. The "fail loudly on future format change" path (both branches fail → `ParseError` with page text logged) correctly satisfies the architecture requirement. No additional spec work needed here.

---

## AC Testability

All ACs have concrete shell/SQL commands. AC-6 is correctly marked "future verification" with an explicit non-blocking note. AC-3 numeric range (volume ±5%, value ±5%) is tight enough to catch parse bugs without being so tight it breaks if IDXCarbon revises a published figure. Acceptable.

---

## Summary

| # | Type | Finding | Severity |
|---|------|---------|----------|
| B-1 | Blocking | `DO NOTHING` + cached-file policy silently blocks ingestion of corrected PDFs; contradicts arch §4 rule 1 | Must fix or get explicit Andy sign-off |
| B-2 | Blocking | "no regex match" vs "matched value 0" conflated for mandatory field check | One-sentence clarification required |
| NB-1 | Non-blocking | pyproject.toml race with T06 — needs pre-sprint Andy decision | Low risk if T06 lands first |
| NB-2 | Non-blocking | Partial-parse NULL not framed as deliberate arch deviation | Clarity only |
| NB-3 | Non-blocking | avg_price_idr computation path (OQ-5) unresolved; blocks downstream ACs | Must resolve before code |
| NB-4 | Non-blocking | Stale-file + DO NOTHING double-lock — acceptable v0.1 scope if explicit | Document intent |
