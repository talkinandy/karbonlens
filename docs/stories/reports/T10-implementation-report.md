# T10 Implementation Report — Seed regulatory events manually

**Story:** T10  
**Status:** done  
**Implementer:** agent (Jenny)  
**Date:** 2026-04-21  
**Spec commit SHA:** d7a538b (docs(stories): revise T06-T10 specs per audit; status -> audited)  
**Branch:** feature/v0.1-impl  

---

## 1. SQL file created

`scrapers/seed/regulatory_events_v1.sql`

## 2. Apply command and output

```
sudo -u postgres psql -d karbonlens --single-transaction \
  -f scrapers/seed/regulatory_events_v1.sql
```

First run (via /tmp/ copy for postgres file-access):

```
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
INSERT 0 1
DO
```

Exit code: 0

---

## 3. Idempotence re-run

```
INSERT 0 0  (×10)
DO
```

Exit code: 0. Count unchanged at 10.

---

## 4. Ten seeded rows

| # | event_date | ministry | doc_type | doc_number | importance | is_upcoming |
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

### Bilingual summaries (for Andy fact-check)

**Row 1 — Perpres 46/2008**  
EN: Established the Dewan Nasional Perubahan Iklim (DNPI), Indonesia's first formal national body for coordinating climate-change policy and reporting. Set the institutional foundation for all subsequent carbon-market regulation.  
ID: Membentuk Dewan Nasional Perubahan Iklim (DNPI), lembaga nasional pertama yang bertugas mengkoordinasikan kebijakan dan pelaporan perubahan iklim. Menjadi landasan kelembagaan bagi seluruh regulasi pasar karbon berikutnya.

**Row 2 — Perpres 91/2016**  
EN: Ratified Indonesia's first NDC under the Paris Agreement, committing to a 29% unconditional and 41% conditional reduction in GHG emissions by 2030 relative to the business-as-usual baseline. Gave legal force to the national climate pledge.  
ID: Meratifikasi NDC Indonesia berdasarkan Perjanjian Paris, menetapkan komitmen penurunan emisi GRK sebesar 29% tanpa syarat dan 41% dengan dukungan internasional pada 2030. Memberikan kekuatan hukum atas janji iklim nasional.

**Row 3 — Perpres 98/2021**  
EN: The cornerstone enabling regulation for Indonesia's carbon economy. Established the National Carbon Value (NEK) framework, mandated the SRN-PPI national registry, created the legal basis for voluntary and compliance carbon markets, and set the trajectory for a domestic carbon tax.  
ID: Regulasi payung untuk ekonomi karbon Indonesia. Menetapkan kerangka Nilai Ekonomi Karbon (NEK), mengamanatkan registri nasional SRN-PPI, menciptakan dasar hukum pasar karbon sukarela dan wajib, serta membuka jalur menuju pajak karbon domestik.

**Row 4 — POJK 14/2023**  
EN: Issued by OJK (Financial Services Authority), this regulation provided the legal and operational framework for carbon trading through a regulated exchange. It designated the Indonesia Stock Exchange (IDX) as the carbon exchange operator and set listing, trading, and transparency requirements.  
ID: Diterbitkan OJK, regulasi ini menetapkan kerangka hukum dan operasional perdagangan karbon melalui bursa yang diawasi. Menunjuk Bursa Efek Indonesia (BEI) sebagai operator bursa karbon dan menetapkan persyaratan pencatatan, perdagangan, dan transparansi.

**Row 5 — IDXCarbon launch day**  
EN: IDXCarbon, the Indonesia Carbon Exchange operated by the Indonesia Stock Exchange (IDX), opened for trading on 26 September 2023 — one of the first regulated carbon exchanges in Southeast Asia. Initial trading was restricted to domestic participants transacting Verra-issued VCUs from Indonesian forestry projects.  
ID: IDXCarbon, Bursa Karbon Indonesia yang dioperasikan BEI, mulai beroperasi pada 26 September 2023 — salah satu bursa karbon terregulasi pertama di Asia Tenggara. Perdagangan awal dibatasi untuk peserta domestik yang bertransaksi VCU berstandar Verra dari proyek kehutanan Indonesia.

**Row 6 — Permenhut 7/2024**  
EN: Operationalised the SRN-PPI national carbon registry for the forestry sector, setting out the procedures for project registration, issuance of carbon units, and data reporting obligations. Required all forest-carbon projects to list through SRN-PPI as a condition for trading on IDXCarbon.  
ID: Mengoperasionalkan registri karbon nasional SRN-PPI untuk sektor kehutanan, mengatur tata cara pendaftaran proyek, penerbitan unit karbon, dan kewajiban pelaporan data. Mewajibkan seluruh proyek karbon hutan mendaftar melalui SRN-PPI sebagai syarat untuk diperdagangkan di IDXCarbon.

**Row 7 — Kepmen LH 20/2025**  
EN: Established the DRAM (Daftar Rencana Aksi Mitigasi) and DPP (Data Pendukung Pemantauan) data portals under the Ministry of Environment (KLH), centralising MRV reporting for all registered GHG mitigation actions and linking SRN-PPI data to the national GHG inventory.  
ID: Menetapkan portal data DRAM dan DPP di bawah Kementerian Lingkungan Hidup, memusatkan pelaporan MRV untuk seluruh aksi mitigasi GRK yang terdaftar dan menghubungkan data SRN-PPI ke inventaris GRK nasional.

**Row 8 — Perpres 110/2025**  
EN: Re-opened international carbon credit trade after a period of restriction, establishing the conditions and approval pathway for Indonesian carbon credits to be sold to foreign buyers under Article 6 of the Paris Agreement. A landmark shift that significantly increases the addressable market for Indonesian project developers.  
ID: Membuka kembali perdagangan kredit karbon internasional setelah masa pembatasan, menetapkan syarat dan jalur persetujuan agar kredit karbon Indonesia dapat dijual ke pembeli asing berdasarkan Pasal 6 Perjanjian Paris. Perubahan penting yang secara signifikan memperluas pasar bagi pengembang proyek Indonesia.

**Row 9 — Permenhut 6/2026**  
EN: Lifted the four-year moratorium on new forestry carbon credit approvals (in force since early 2022), re-enabling REDD+, peatland, and conservation projects to seek certification and trade on IDXCarbon. Widely regarded as the regulatory unlock most needed to scale Indonesia's carbon market in 2026.  
ID: Mencabut moratorium empat tahun atas persetujuan kredit karbon kehutanan baru (berlaku sejak awal 2022), memungkinkan kembali proyek REDD+, gambut, dan konservasi untuk mendapatkan sertifikasi dan diperdagangkan di IDXCarbon. Dianggap sebagai pembukaan regulasi yang paling dibutuhkan untuk mengembangkan pasar karbon Indonesia pada 2026.

**Row 10 — IDXCarbon full-scale launch (forecast, is_upcoming=TRUE)**  
EN: Forecast mid-2026 opening of IDXCarbon to international participants, following the 2025 Perpres that re-enabled international carbon credit trade. Expected to significantly increase liquidity and price discovery on the exchange. Exact date subject to OJK rulemaking.  
ID: Perkiraan pembukaan IDXCarbon untuk peserta internasional pada pertengahan 2026, menyusul Perpres 2025 yang membuka kembali perdagangan kredit karbon internasional. Diharapkan meningkatkan likuiditas dan price discovery secara signifikan. Tanggal pasti menunggu aturan pelaksanaan OJK.

---

## 5. Acceptance criteria results

| AC | Description | Result |
|---|---|---|
| AC-1 | Seed applies cleanly; COUNT(*) = 10 | PASS (count=10, exit 0) |
| AC-2 | Re-run is idempotent; count unchanged | PASS (count=10, all INSERT 0 0, exit 0) |
| AC-3 | No NULL summary_en or summary_id | PASS (0 nulls) |
| AC-4 | No NULL required fields | PASS (0 nulls) |
| AC-5 | Exactly 1 upcoming; event_date >= 2026-06-01 | PASS (count=1, date=2026-07-01) |
| AC-6 | >= 3 critical rows; includes 98/2021, 110/2025, 6/2026 | PASS (count=4; all three present + 14/2023) |
| AC-7 | >= 2 rows with 'forestry' tag | PASS (count=2: rows 6 and 9) |
| AC-8 | Unprivileged karbonlens role works | PASS (exit 0, count=10) |
| AC-9 | Andy fact-check of summaries | PENDING — see §6 below |

---

## 6. Andy fact-check items (AC-9)

Andy: please confirm or correct the following at code-audit stage.

### Facts requiring domain confirmation

1. **Row 1 — Perpres 46/2008 (DNPI)**: Date recorded as 2009-05-26. The Perpres number is 46/2008 but the effective/signed date was 2009. Confirm the exact date is correct and that DNPI was indeed Indonesia's *first* formal climate body at the national level.

2. **Row 2 — Perpres 91/2016 (NDC ratification)**: Date 2016-10-24. Confirm this is the correct ratification date and that the 29%/41% GHG targets are still the correct framing (Indonesia revised its NDC in 2022 to 31.89%/43.2% — the row describes the *first* NDC ratification in 2016, not the enhanced NDC).

3. **Row 3 — Perpres 98/2021 (NEK)**: Date 2021-10-29. Widely cited. Confirm.

4. **Row 4 — POJK 14/2023**: Date 2023-09-26 and document number 14/2023. Confirm. OJK URL included — verify it resolves correctly.

5. **Row 5 — IDXCarbon launch**: Date 2023-09-26 (same day as POJK 14/2023). Confirm this is the correct launch date and that "one of the first regulated carbon exchanges in Southeast Asia" is accurate.

6. **Row 6 — Permenhut 7/2024 (SRN-PPI)**: Date 2024-07-08, document number 7/2024, importance=medium. Confirm the document number, date, and that this is the operative regulation for SRN-PPI forestry sector operationalization. URL is NULL (not found at authoring).

7. **Row 7 — Kepmen LH 20/2025 (DRAM/DPP)**: Date 2025-03-15, document number 20/2025, importance=medium. Post-cutoff. Confirm document number, date, and that DRAM/DPP refers to these specific portal names under KLH. URL is NULL.

8. **Row 8 — Perpres 110/2025**: Date 2025-04-22, importance=critical. Post-cutoff and future-dated as of spec authoring. Confirm document number (110/2025), date, and that this Perpres specifically re-opened international carbon credit trade under Article 6. URL is NULL.

9. **Row 9 — Permenhut 6/2026**: Date 2026-01-14, importance=critical. Future-dated. Confirm document number (6/2026), date, and that this lifts the forestry credit moratorium that started in early 2022. URL is NULL.

10. **Row 10 — IDXCarbon full-scale launch (forecast)**: event_date=2026-07-01 (placeholder, first-of-month convention), is_upcoming=TRUE. Confirm "mid-2026" is still the expected timeframe and that no OJK rulemaking has been published yet. When announced, update via DELETE + v2 seed or UPDATE.

### Documents with NULL URLs (need follow-up)
Rows 5, 6, 7, 8, 9, 10 have `document_url = NULL`. Check `peraturan.bpk.go.id` for rows 6, 7, 8; Kemenhut JDIH for rows 6 and 9; OJK website for row 4 URL validity.

---

## 7. Deviations from spec

None. The spec's §3 table is the authoritative ordering (chronological by event_date). The task instructions header table listed rows in a different order — the SQL file and this report follow the spec's definitive per-row detail section.

The `importance` values for rows 6 and 7 in the spec's §3 table are `medium` (not `high` as noted in the task instructions table header). The spec per-row detail and the spec §3 data table were followed as authoritative.

---

## 8. Files created

- `scrapers/seed/regulatory_events_v1.sql` — seed file (only file created by this story, per spec §3 scope)
- `docs/stories/reports/T10-implementation-report.md` — this file
