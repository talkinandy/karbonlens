---
id: T10
title: Seed regulatory events manually
phase: 2
status: audited
blocked_by: [T02]
blocks: [T15]
owner: agent
effort_estimate: 1h
---

## 1. User story

As Andy (platform operator), I want the `regulatory_events` table pre-populated with the 10 most important Indonesian carbon regulations, so that the regulatory timeline screen (T15) has real, bilingual content from the moment it ships — without waiting for an automated scraper.

## 2. Context & rationale

The `regulatory_events` table was created by T02 but is empty. The v0.1 PRD scope explicitly includes a "Regulatory timeline screen (manual entries)" — no scraper is planned until v0.2.

The 10 rows are hand-curated by Andy. They span the full arc of Indonesian carbon-market law: from the first formal climate body (2009) through the Perpres and OJK regulations that enabled IDXCarbon, to recent Kemenhut regulations that lifted the four-year forestry credit freeze, to the upcoming forecast IDX full-scale launch.

The seed file must be idempotent (safe to re-run), committed to the repo, and portable across developer machines and the production VPS. All summaries are bilingual: `summary_en` and `summary_id` are both required, reflecting the PRD's bilingual content principle (EN-only UI chrome, bilingual regulatory content).

The `document_number` column has no UNIQUE constraint in the schema (different ministries legitimately reuse numbers, e.g., two Perpres can share the same number across years). Rather than add a migration for a unique index, the seed uses a `WHERE NOT EXISTS` guard with a compound `(document_number, ministry)` predicate — robust dedupe without schema changes.

## 3. Scope

### In scope

1. **`scrapers/seed/regulatory_events_v1.sql`** — the seed file.

   **Idempotency pattern.** Because `document_number` is not UNIQUE, `ON CONFLICT` cannot be used directly. Each INSERT is wrapped as:

   ```sql
   INSERT INTO regulatory_events (
       event_date, ministry, document_type, document_number,
       title, document_url, summary_en, summary_id,
       importance, tags, is_upcoming
   )
   SELECT
       '<date>', '<ministry>', '<type>', '<number>',
       '<title>', '<url_or_null>', '<summary_en>', '<summary_id>',
       '<importance>', ARRAY[<tags>], <is_upcoming>
   WHERE NOT EXISTS (
       SELECT 1 FROM regulatory_events
       WHERE document_number = '<number>'
         AND ministry = '<ministry>'
   );
   ```

   For rows where `document_number` is a sentinel value (`'N/A'` for Row 5 IDXCarbon launch day, `'IDX-LAUNCH-2026'` for Row 10 forecast), the dedupe key switches to `(document_number, title, event_date)` instead of `(document_number, ministry)` — explicitly noted in a SQL comment on each row. Using a unique identifiable sentinel (not bare `'TBD'`) makes the row recognisable and prevents false matches if a second TBD-style row is ever added. When the real document number is known later, update via a new seed file (`regulatory_events_v2.sql`) or a manual `UPDATE`.

2. **The 10 seed events.** Each row includes bilingual summaries (1–3 sentences each), `importance`, `tags[]`, `document_url` (NULL if no canonical public URL; see §7), and `is_upcoming`.

   | # | event_date | ministry | document_type | document_number | importance | is_upcoming |
   |---|---|---|---|---|---|---|
   | 1 | 2009-05-26 | Presidential | Perpres | 46/2008 | medium | FALSE |
   | 2 | 2016-10-24 | Presidential | Perpres | 91/2016 | high | FALSE |
   | 3 | 2021-10-29 | Presidential | Perpres | 98/2021 | critical | FALSE |
   | 4 | 2023-09-26 | OJK | POJK | 14/2023 | critical | FALSE |
   | 5 | 2023-09-26 | IDX | Launch | N/A | high | FALSE |
   | 6 | 2024-07-08 | Kemenhut | Permenhut | 7/2024 | medium | FALSE |
   | 7 | 2025-03-15 | Kementerian LH | Kepmen | 20/2025 | medium | FALSE |
   | 8 | 2025-04-22 | Presidential | Perpres | 110/2025 | critical | FALSE |
   | 9 | 2026-01-14 | Kemenhut | Permenhut | 6/2026 | critical | FALSE |
   | 10 | 2026-07-01 | IDX | Launch | IDX-LAUNCH-2026 | high | TRUE |

   Full per-row detail (all values to be written verbatim into the SQL):

   **Row 1 — Perpres 46/2008**
   - title: `Badan Pengendalian Perubahan Iklim (DNPI)`
   - tags: `ARRAY['climate-governance','dnpi']`
   - document_url: `https://peraturan.bpk.go.id/Details/41295/perpres-no-46-tahun-2008`
   - summary_en: `Established the Dewan Nasional Perubahan Iklim (DNPI), Indonesia's first formal national body for coordinating climate-change policy and reporting. Set the institutional foundation for all subsequent carbon-market regulation.`
   - summary_id: `Membentuk Dewan Nasional Perubahan Iklim (DNPI), lembaga nasional pertama yang bertugas mengkoordinasikan kebijakan dan pelaporan perubahan iklim. Menjadi landasan kelembagaan bagi seluruh regulasi pasar karbon berikutnya.`

   **Row 2 — Perpres 91/2016**
   - title: `Ratifikasi Nationally Determined Contribution (NDC) Indonesia`
   - tags: `ARRAY['ndc','paris-agreement','ghg-target']`
   - document_url: `https://peraturan.bpk.go.id/Details/48619/perpres-no-91-tahun-2016`
   - summary_en: `Ratified Indonesia's first NDC under the Paris Agreement, committing to a 29% unconditional and 41% conditional reduction in GHG emissions by 2030 relative to the business-as-usual baseline. Gave legal force to the national climate pledge.`
   - summary_id: `Meratifikasi NDC Indonesia berdasarkan Perjanjian Paris, menetapkan komitmen penurunan emisi GRK sebesar 29% tanpa syarat dan 41% dengan dukungan internasional pada 2030. Memberikan kekuatan hukum atas janji iklim nasional.`

   **Row 3 — Perpres 98/2021**
   - title: `Nilai Ekonomi Karbon — Kerangka Ekonomi Karbon Nasional`
   - tags: `ARRAY['carbon-economy','nek','pricing','srn-ppi']`
   - document_url: `https://peraturan.bpk.go.id/Details/174596/perpres-no-98-tahun-2021`
   - summary_en: `The cornerstone enabling regulation for Indonesia's carbon economy. Established the National Carbon Value (NEK) framework, mandated the SRN-PPI national registry, created the legal basis for voluntary and compliance carbon markets, and set the trajectory for a domestic carbon tax.`
   - summary_id: `Regulasi payung untuk ekonomi karbon Indonesia. Menetapkan kerangka Nilai Ekonomi Karbon (NEK), mengamanatkan registri nasional SRN-PPI, menciptakan dasar hukum pasar karbon sukarela dan wajib, serta membuka jalur menuju pajak karbon domestik.`

   **Row 4 — POJK 14/2023**
   - title: `Perdagangan Karbon melalui Bursa Karbon (IDXCarbon)`
   - tags: `ARRAY['idxcarbon','carbon-exchange','ojk','compliance']`
   - document_url: `https://ojk.go.id/id/regulasi/otoritas-jasa-keuangan/peraturan-ojk/Pages/Peraturan-OJK-Nomor-14-Tahun-2023-tentang-Perdagangan-Karbon-melalui-Bursa-Karbon.aspx`
   - summary_en: `Issued by OJK (Financial Services Authority), this regulation provided the legal and operational framework for carbon trading through a regulated exchange. It designated the Indonesia Stock Exchange (IDX) as the carbon exchange operator and set listing, trading, and transparency requirements.`
   - summary_id: `Diterbitkan OJK, regulasi ini menetapkan kerangka hukum dan operasional perdagangan karbon melalui bursa yang diawasi. Menunjuk Bursa Efek Indonesia (BEI) sebagai operator bursa karbon dan menetapkan persyaratan pencatatan, perdagangan, dan transparansi.`

   **Row 5 — IDXCarbon Launch**
   - title: `Peluncuran IDXCarbon — Bursa Karbon Indonesia`
   - tags: `ARRAY['idxcarbon','carbon-exchange','launch','idx']`
   - document_url: NULL
   - summary_en: `IDXCarbon, the Indonesia Carbon Exchange operated by the Indonesia Stock Exchange (IDX), opened for trading on 26 September 2023 — one of the first regulated carbon exchanges in Southeast Asia. Initial trading was restricted to domestic participants transacting Verra-issued VCUs from Indonesian forestry projects.`
   - summary_id: `IDXCarbon, Bursa Karbon Indonesia yang dioperasikan BEI, mulai beroperasi pada 26 September 2023 — salah satu bursa karbon terregulasi pertama di Asia Tenggara. Perdagangan awal dibatasi untuk peserta domestik yang bertransaksi VCU berstandar Verra dari proyek kehutanan Indonesia.`

   **Row 6 — Permenhut 7/2024**
   - title: `Operasionalisasi Registri SRN-PPI`
   - tags: `ARRAY['srn-ppi','registry','forestry','mrvb']`
   - document_url: NULL
   - summary_en: `Operationalised the SRN-PPI national carbon registry for the forestry sector, setting out the procedures for project registration, issuance of carbon units, and data reporting obligations. Required all forest-carbon projects to list through SRN-PPI as a condition for trading on IDXCarbon.`
   - summary_id: `Mengoperasionalkan registri karbon nasional SRN-PPI untuk sektor kehutanan, mengatur tata cara pendaftaran proyek, penerbitan unit karbon, dan kewajiban pelaporan data. Mewajibkan seluruh proyek karbon hutan mendaftar melalui SRN-PPI sebagai syarat untuk diperdagangkan di IDXCarbon.`

   **Row 7 — Kepmen LH 20/2025**
   - title: `DRAM/DPP — Pendaftaran dan Portal Data Iklim`
   - tags: `ARRAY['registry','dram','data-portal','klh']`
   - document_url: NULL
   - summary_en: `Established the DRAM (Daftar Rencana Aksi Mitigasi) and DPP (Data Pendukung Pemantauan) data portals under the Ministry of Environment (KLH), centralising MRV reporting for all registered GHG mitigation actions and linking SRN-PPI data to the national GHG inventory.`
   - summary_id: `Menetapkan portal data DRAM dan DPP di bawah Kementerian Lingkungan Hidup, memusatkan pelaporan MRV untuk seluruh aksi mitigasi GRK yang terdaftar dan menghubungkan data SRN-PPI ke inventaris GRK nasional.`

   **Row 8 — Perpres 110/2025**
   - title: `Pembukaan Kembali Perdagangan Kredit Karbon Internasional`
   - tags: `ARRAY['international-trade','carbon-credits','article6','presidential']`
   - document_url: NULL
   - summary_en: `Re-opened international carbon credit trade after a period of restriction, establishing the conditions and approval pathway for Indonesian carbon credits to be sold to foreign buyers under Article 6 of the Paris Agreement. A landmark shift that significantly increases the addressable market for Indonesian project developers.`
   - summary_id: `Membuka kembali perdagangan kredit karbon internasional setelah masa pembatasan, menetapkan syarat dan jalur persetujuan agar kredit karbon Indonesia dapat dijual ke pembeli asing berdasarkan Pasal 6 Perjanjian Paris. Perubahan penting yang secara signifikan memperluas pasar bagi pengembang proyek Indonesia.`

   **Row 9 — Permenhut 6/2026**
   - title: `Pencabutan Moratorium Kredit Karbon Kehutanan`
   - tags: `ARRAY['forestry','redd','peatland','moratorium-lifted']`
   - document_url: NULL
   - summary_en: `Lifted the four-year moratorium on new forestry carbon credit approvals (in force since early 2022), re-enabling REDD+, peatland, and conservation projects to seek certification and trade on IDXCarbon. Widely regarded as the regulatory unlock most needed to scale Indonesia's carbon market in 2026.`
   - summary_id: `Mencabut moratorium empat tahun atas persetujuan kredit karbon kehutanan baru (berlaku sejak awal 2022), memungkinkan kembali proyek REDD+, gambut, dan konservasi untuk mendapatkan sertifikasi dan diperdagangkan di IDXCarbon. Dianggap sebagai pembukaan regulasi yang paling dibutuhkan untuk mengembangkan pasar karbon Indonesia pada 2026.`

   **Row 10 — IDXCarbon Full-Scale Launch (upcoming)**
   - event_date: `2026-07-01` (forecast placeholder — SQL DATE cannot hold "mid-2026"; use first of month; SQL comment: `/* forecast; update when announced */`)
   - document_number: `'IDX-LAUNCH-2026'` (unique identifiable sentinel; replace with real number when announced; dedupe key is `(document_number, title, event_date)`)
   - title: `IDXCarbon Peluncuran Skala Penuh — Peserta Internasional`
   - tags: `ARRAY['idxcarbon','international','launch','upcoming']`
   - document_url: NULL
   - is_upcoming: TRUE
   - summary_en: `Forecast mid-2026 opening of IDXCarbon to international participants, following the 2025 Perpres that re-enabled international carbon credit trade. Expected to significantly increase liquidity and price discovery on the exchange. Exact date subject to OJK rulemaking.`
   - summary_id: `Perkiraan pembukaan IDXCarbon untuk peserta internasional pada pertengahan 2026, menyusul Perpres 2025 yang membuka kembali perdagangan kredit karbon internasional. Diharapkan meningkatkan likuiditas dan price discovery secara signifikan. Tanggal pasti menunggu aturan pelaksanaan OJK.`

3. **Apply command** (run once on VPS or local dev DB; idempotent on re-run):

   ```bash
   sudo -u postgres psql -d karbonlens --single-transaction \
     -f scrapers/seed/regulatory_events_v1.sql
   ```

   Or as the `karbonlens` DB user:

   ```bash
   PGPASSWORD=<password> psql -U karbonlens -h localhost -d karbonlens \
     --single-transaction -f scrapers/seed/regulatory_events_v1.sql
   ```

   `--single-transaction` ensures either all rows land or none do (rolls back on any parse error).

4. **No architecture.md changes.** The regulatory events table is already documented there. The seed is self-documenting via SQL comments within the file itself.

### Out of scope (explicit non-goals)

- Automated regulatory scraper (v0.2 — will crawl `peraturan.bpk.go.id`, `esdm.go.id`, Kemenhut JDIH).
- Regulatory change-log / diff tracking.
- Translation pipeline — all bilingual content is hand-authored for v0.1.
- Linking regulatory events to specific projects.
- Newsletter or alerting on new regulations (v0.2 watchlists).
- Adding a UNIQUE index or new migration for `document_number` — the `WHERE NOT EXISTS` pattern is sufficient.
- Admin UI for adding new events (v0.2).

## 4. Acceptance criteria (Gherkin)

**AC-1: Seed applies cleanly**
```
Given the regulatory_events table exists (T02 done) and is empty or partially populated
When  sudo -u postgres psql -d karbonlens --single-transaction -f scrapers/seed/regulatory_events_v1.sql
Then  the command exits 0
And   SELECT COUNT(*) FROM regulatory_events; returns 10
```

**AC-2: Re-run is idempotent**
```
Given the seed has already been applied (AC-1 passed)
When  the apply command is run a second time
Then  the command exits 0
And   SELECT COUNT(*) FROM regulatory_events; still returns 10 (no duplicates)
```

**AC-3: No NULL bilingual summaries**
```
Given the seed has been applied
When  SELECT COUNT(*) FROM regulatory_events WHERE summary_en IS NULL OR summary_id IS NULL;
Then  result is 0
```

**AC-4: No NULL required fields**
```
Given the seed has been applied
When  SELECT COUNT(*) FROM regulatory_events
      WHERE event_date IS NULL OR ministry IS NULL OR title IS NULL
         OR importance IS NULL OR tags IS NULL;
Then  result is 0
```

**AC-5: Upcoming events correctly flagged**
```
Given the seed has been applied
When  SELECT COUNT(*) FROM regulatory_events WHERE is_upcoming = TRUE;
Then  result is exactly 1 (IDXCarbon full-scale launch, row #10)
And   SELECT event_date FROM regulatory_events WHERE is_upcoming = TRUE;
      returns a date >= 2026-06-01 (forecast mid-2026)
```

**AC-6: Critical-importance events present**
```
Given the seed has been applied
When  SELECT COUNT(*) FROM regulatory_events WHERE importance = 'critical';
Then  result is >= 3
And   the set includes document_number IN ('98/2021', '110/2025', '6/2026')
```

**AC-7: Tag array queryable**
```
Given the seed has been applied
When  SELECT COUNT(*) FROM regulatory_events WHERE 'forestry' = ANY(tags);
Then  result is >= 2 (Permenhut 6/2026 and Permenhut 7/2024 both carry forestry-related tags)
```

**AC-8: Unprivileged connection also works**
```
Given a psql connection using the karbonlens DB user (not postgres superuser)
When  PGPASSWORD=<pw> psql -U karbonlens -h localhost -d karbonlens \
      --single-transaction -f scrapers/seed/regulatory_events_v1.sql
Then  the command exits 0 and COUNT(*) returns 10
```

**AC-9: Human-readable summaries**
```
Given the seed has been applied
When  Andy reads SELECT title, summary_en, summary_id FROM regulatory_events ORDER BY event_date;
Then  every row has coherent prose — no Lorem Ipsum, no placeholder text, no SQL injection artefacts
```

## 5. Inputs & outputs

- **Inputs:** Andy's domain knowledge of Indonesian carbon regulation; this story spec; `docs/architecture.md` §3 for column names and types.
- **Outputs:**
  - `scrapers/seed/regulatory_events_v1.sql` — the only file created by this story.
  - `regulatory_events` table populated with 10 rows on the target database.
  - No new env vars. No new migrations. No new schema changes.

## 6. Dependencies & interactions

- **Blocked by:** T02 (the `regulatory_events` table must exist before the seed can run).
- **Blocks:** T15 (regulatory timeline screen reads from this table).
- **File owned by this story:** `scrapers/seed/regulatory_events_v1.sql` — no other file may be created or modified.
- **Parallel safety:** this story touches only the seed directory; no conflict risk with T06–T09.
- **Tag vocabulary (cross-phase decision, locked):** T10 uses ad-hoc tags (the 18 proposed in §3 are the working set). T15 **must** build its filter UI dynamically via `SELECT DISTINCT unnest(tags) FROM regulatory_events` — no hardcoded filter list. This ensures any tags added via future seed files automatically appear in the T15 filter without a code change. T15 implementer: do not hardcode tag strings.

## 7. Edge cases & failure modes

- **`document_number` collisions across ministries.** Two different regulations can share a number (e.g., two Perpres from different years). The dedupe predicate uses `(document_number, ministry)` as the compound key. Row #5 (IDXCarbon launch day) has `document_number = 'N/A'`; Row #10 (forecast) has `document_number = 'IDX-LAUNCH-2026'`. Both sentinel rows switch their dedupe key to `(document_number, title, event_date)`. Each is annotated with an inline SQL comment explaining the sentinel value and the corrective action when the real number is known.

- **Future-dated events and is_upcoming semantics.** `is_upcoming = TRUE` means "not yet in effect as of the seed date; `event_date` may be forecast/approximate." Row #10 carries `is_upcoming = TRUE` and `event_date = '2026-07-01'` as a forecast placeholder (SQL DATE cannot hold "mid-2026"; first-of-month convention applies; annotated `/* forecast; update when announced */`). If the event date shifts, Andy deletes the row and re-runs the seed (idempotent insert-only; see OQ-4). T15 will render `is_upcoming = TRUE` rows with an "Upcoming" visual treatment and surface the "Exact date TBD" caveat from the row's `summary_en`/`summary_id`.

- **`importance` value validation.** The `importance` column is `TEXT` with no `CHECK` constraint in the schema (known limitation; adding a constraint is out of scope for T10). To catch typos at apply time the seed file includes a self-validating assertion after all INSERTs:
  ```sql
  DO $$ BEGIN
    ASSERT (
      SELECT COUNT(*) FROM regulatory_events
      WHERE importance NOT IN ('critical','high','medium','low')
    ) = 0,
    'T10 seed: importance value outside allowed set (critical|high|medium|low)';
  END $$;
  ```
  If any row carries a misspelled importance value the entire transaction rolls back (because `--single-transaction` is used).

- **Missing `document_url`.** Several older Perpres and newer Permenhut lack a canonical public URL at authoring time. These fields are inserted as `NULL`. A comment in the SQL flags each NULL URL for Andy's follow-up: `-- URL: not found at time of authoring; check peraturan.bpk.go.id`.

- **Summary length.** Each summary is 2–3 sentences (target 40–80 words per language). Longer summaries are not an error, but implementers should not pad to meet a word count.

- **Legal accuracy.** The summaries in this spec are informational descriptions, not legal translations. Andy must spot-review each row's `summary_en` and `summary_id` before merging (see §9).

- **`--single-transaction` on partial failure.** If any INSERT raises a Postgres error (e.g., wrong data type), the entire file rolls back. This is the intended behaviour — a partial seed is worse than no seed.

- **Upcoming event date becomes past.** If the IDXCarbon full-scale launch occurs and the date passes, Andy should update `is_upcoming = FALSE` and set the real `event_date`. A v0.2 admin form will make this easier.

## 8. Definition of done

- [ ] All acceptance criteria (AC-1 through AC-9) pass.
- [ ] `scrapers/seed/regulatory_events_v1.sql` landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`: `T10 — Seed regulatory events manually`.
- [ ] TASKS.md status flipped from `todo` → `done` for T10.
- [ ] Story frontmatter `status` set to `done`.
- [ ] **Andy reviews the seed SQL content (each row's facts: document numbers, dates, titles, summaries) at code-audit stage, not merge stage.** The code-auditor's report must include a fact-check section listing all 10 rows and explicitly requesting Andy's confirmation on each. The implementer writes SQL against the draft list; the code-auditor re-verifies facts and flags corrections; a fix round is applied if needed before merge.

## 9. Open questions

1. **[OQ-1 — Andy fact-check at code-audit stage] Confirm/correct the 10-row draft list.** The list in §3 is a working draft derived from Andy's domain notes and `docs/TASKS.md` T10 context (design brief Screen 5). **Implementation proceeds on this draft; Andy's confirmation is not required before the SQL file is written.** At code-audit stage the code-auditor will produce a fact-check section covering every row (document number, date, title, bilingual summaries). Andy: please confirm or correct at that point — propose adding or removing rows as needed. If the design brief Screen 5 lists a different set of events, those corrections are applied in a code-audit fix round before merge.

2. **Upcoming event semantics.** Should `is_upcoming = TRUE` apply only to events with a strictly future `event_date`, or also to regulations that have been signed/published but whose operational provisions have not yet taken effect? For v0.1 the spec uses strictly future dates only. If Andy wants "enacted but not yet in force" rows to be flagged upcoming, the implementer should add a second boolean column (out of scope for T10; note for v0.2).

3. **Document URLs for older Perpres.** `peraturan.bpk.go.id` has most, but some older URLs return 404. Default URL template: `https://peraturan.bpk.go.id/` search page. Should we use search-page URLs as fallbacks or leave `NULL`? Recommendation: leave `NULL` and add a comment. Andy confirms.

4. **Idempotent UPDATE vs INSERT-only.** The current `WHERE NOT EXISTS` pattern is insert-only: if a row already exists, re-running the seed will not update its fields (e.g., if a URL is found later or a summary is corrected). For v0.1 this is acceptable — corrections are made by DELETE + re-run. If Andy wants an upsert-style behaviour (update existing rows on re-run), the pattern changes to `INSERT ... ON CONFLICT (...) DO UPDATE SET ...` which requires either a UNIQUE constraint or a named unique index. Flag for Andy before implementation.

5. **Legal review.** The bilingual summaries in §3 are written by the spec author as informational descriptions. They should be reviewed by Andy (who has domain expertise) before the file is merged. AC-9 captures this as a human-review gate.

## 10. References

- `docs/PRD.md` — §3 v0.1 in-scope: "Regulatory timeline screen (manual entries)"
- `docs/architecture.md` — §3 `regulatory_events` table schema
- `docs/TASKS.md` — T10 task block (design brief Screen 5 reference)
- `docs/stories/README.md` — story lifecycle and conventions
- T15 story (forthcoming) — the frontend screen that consumes this seed data
