---
story: T10
auditor: adversarial-spec-auditor
date: 2026-04-19
verdict: CONDITIONAL PASS
blocking_findings: 1
advisory_findings: 4
---

# T10 Spec Audit — Seed regulatory events manually

## Verdict

**Conditional pass. 1 blocking finding, 4 advisory findings.** Implementer must not write the SQL until Andy confirms the 10-event list (OQ-1). Everything else is implementable as written, but four issues need Andy's awareness before T15 ships.

---

## Blocking finding

**B-1: Event list unconfirmed.** The 10 rows in §3 are a plausible agent-drafted list, not Andy-confirmed data. Several entries carry future dates (Rows 8–10) and document numbers that may be wrong or forecasted (Perpres 110/2025 Pembukaan Kembali, Permenhut 6/2026 Pencabutan Moratorium, Kepmen LH 20/2025 are all post-cutoff and unverifiable without Andy). OQ-1 is the gate, but the story does not require Andy's sign-off before the implementer starts writing SQL — it only requires it before merge. The DoD should be tightened: **Andy must confirm the list and document numbers before the SQL file is written, not just before it is merged.** Risk: implementer authors 10 elaborate bilingual rows against incorrect data.

---

## Advisory findings

**A-1: N/A dedupe gotcha (also affects TBD row).** The `WHERE NOT EXISTS (... WHERE document_number = 'N/A' AND ministry = '<ministry>')` guard for Row 5 is correct as specified — the spec switches the compound key to `(document_number, title)` for that row. Confirmed safe. However, Row 10 uses `document_number = 'TBD'`; on a second seed run with a corrected document number, `TBD` would not match, so the updated row would insert as a duplicate. The spec correctly notes this is insert-only and corrections require DELETE + re-run (§7, OQ-4), but this is fragile. **Advisory: document the TBD/N/A sentinel values explicitly in a SQL comment block at the top of the file.**

**A-2: importance not schema-enforced.** `regulatory_events.importance` is `TEXT` with no `CHECK` constraint (confirmed in 001_init.sql). A typo (`'critcial'`, `'Critical'`) silently passes. The seed SQL itself is hand-written, so a typo is plausible. **Advisory: add an inline SQL assertion after INSERT block — e.g., `DO $$ BEGIN ASSERT (SELECT COUNT(*) FROM regulatory_events WHERE importance NOT IN ('critical','high','medium','low')) = 0, 'importance value outside enum'; END $$;` — so the seed self-validates at apply time.**

**A-3: Tag vocabulary not locked — cross-story risk with T15.** The seed introduces 18 distinct tag strings (e.g. `'climate-governance'`, `'moratorium-lifted'`, `'article6'`, `'dram'`). T15 (regulatory timeline screen) will filter by tag. If T15 builds a hardcoded filter list, any seed tag not in that list renders the filter broken or silently empty. The spec acknowledges T15 reads from this table but defers tag-vocabulary lock. **Advisory: T15 story must specify whether its filter options are hardcoded or built dynamically via `SELECT DISTINCT unnest(tags) FROM regulatory_events`. Recommend dynamic; flag this as a pre-T15-implementation dependency.**

**A-4: is_upcoming semantics underspecified for T15 display.** OQ-2 asks whether `is_upcoming` covers "enacted but not yet in force" — the spec defers to v0.2. The upcoming event (Row 10, `event_date = '2026-07-01'`) has a forecast date. The spec correctly treats this as a UI-treatment flag, not data correctness. However, T15 may need to render upcoming rows differently (e.g. greyed out, labelled "forecast"). If T15 treats `is_upcoming` as a display flag without a separate "forecast date" label, users could mistake `2026-07-01` as a confirmed date. **Advisory: T15 spec should enforce a visual distinction for `is_upcoming = TRUE` rows and display the "Exact date TBD" caveat from the seed's summary_en.**

---

## Findings confirmed as non-issues

- **Dedupe pattern is correct SQL.** `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM ...)` is valid Postgres and idempotent.
- **No migration needed.** Confirmed: schema exists in 001_init.sql, no new columns required.
- **Bilingual coverage.** All 10 rows have non-null `summary_en` and `summary_id`; AC-3 query catches any future regression.
- **AC-9 human-gate.** Acceptable as a soft gate given legal accuracy is domain-dependent.
- **--single-transaction rollback on error.** Correct and safe.
- **File location.** `scrapers/seed/regulatory_events_v1.sql` is not in `scrapers/migrations/` — correct, seeds are not migrations.
