-- =============================================================================
-- T10: Seed regulatory_events — 8 curated Indonesian carbon-market milestones
-- =============================================================================
-- Fact-check pass 2026-04-21 (commit introducing the corrections landed in
-- the same day as initial seed): two unverified rows (Permenhut 7/2024,
-- Kepmen LH 20/2025) were removed. Rows 8 (Perpres 110/2025) and 9
-- (Permenhut 6/2026) had incorrect dates and titles — corrected here from
-- primary sources (peraturan.go.id, antaranews.com, kehutanan.go.id).
-- Row 10 (IDX full launch) had an unsupported specific date; placeholder
-- year-end used pending an official announcement.
-- =============================================================================
-- Apply:  sudo -u postgres psql -d karbonlens --single-transaction \
--             -f scrapers/seed/regulatory_events_v1.sql
-- Or:     PGPASSWORD=<pw> psql -U karbonlens -h localhost -d karbonlens \
--             --single-transaction -f scrapers/seed/regulatory_events_v1.sql
--
-- Idempotency: each INSERT uses WHERE NOT EXISTS with a compound dedupe key.
--   Standard rows:  (document_number, ministry)
--   Sentinel rows:  (document_number, title, event_date) — see rows 5 & 10
--
-- Sentinel document_number values:
--   'N/A'            — Row 5 (IDXCarbon launch day): no formal document number.
--                      Action: if a real number is ever assigned, delete the row
--                      and re-run the seed (insert-only; WHERE NOT EXISTS will
--                      not re-insert on a changed document_number sentinel).
--   'IDX-LAUNCH-2026'— Row 10 (forecast): unique sentinel, not a real number.
--                      Replace with real document number when OJK announces.
--
-- Self-validation assertion (at end of file) catches importance typos before
-- the transaction commits.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Row 1 — Perpres 46/2008 — DNPI (first formal climate body)
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2009-05-26',
    'Presidential',
    'Perpres',
    '46/2008',
    'Dewan Nasional Perubahan Iklim (DNPI)',
    'https://peraturan.bpk.go.id/Details/41295/perpres-no-46-tahun-2008',
    'Established the Dewan Nasional Perubahan Iklim (DNPI), Indonesia''s first formal national body for coordinating climate-change policy and reporting. Set the institutional foundation for all subsequent carbon-market regulation.',
    'Membentuk Dewan Nasional Perubahan Iklim (DNPI), lembaga nasional pertama yang bertugas mengkoordinasikan kebijakan dan pelaporan perubahan iklim. Menjadi landasan kelembagaan bagi seluruh regulasi pasar karbon berikutnya.',
    'medium',
    ARRAY['climate-governance','dnpi'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '46/2008'
      AND ministry = 'Presidential'
);

-- ---------------------------------------------------------------------------
-- Row 2 — Perpres 91/2016 — NDC ratification
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2016-10-24',
    'Presidential',
    'Perpres',
    '91/2016',
    'Ratifikasi Nationally Determined Contribution (NDC) Indonesia',
    'https://peraturan.bpk.go.id/Details/48619/perpres-no-91-tahun-2016',
    'Ratified Indonesia''s first NDC under the Paris Agreement, committing to a 29% unconditional and 41% conditional reduction in GHG emissions by 2030 relative to the business-as-usual baseline. Gave legal force to the national climate pledge.',
    'Meratifikasi NDC Indonesia berdasarkan Perjanjian Paris, menetapkan komitmen penurunan emisi GRK sebesar 29% tanpa syarat dan 41% dengan dukungan internasional pada 2030. Memberikan kekuatan hukum atas janji iklim nasional.',
    'high',
    ARRAY['ndc','paris-agreement','ghg-target'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '91/2016'
      AND ministry = 'Presidential'
);

-- ---------------------------------------------------------------------------
-- Row 3 — Perpres 98/2021 — NEK enabling framework
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2021-10-29',
    'Presidential',
    'Perpres',
    '98/2021',
    'Nilai Ekonomi Karbon — Kerangka Ekonomi Karbon Nasional',
    'https://peraturan.bpk.go.id/Details/174596/perpres-no-98-tahun-2021',
    'The cornerstone enabling regulation for Indonesia''s carbon economy. Established the National Carbon Value (NEK) framework, mandated the SRN-PPI national registry, created the legal basis for voluntary and compliance carbon markets, and set the trajectory for a domestic carbon tax.',
    'Regulasi payung untuk ekonomi karbon Indonesia. Menetapkan kerangka Nilai Ekonomi Karbon (NEK), mengamanatkan registri nasional SRN-PPI, menciptakan dasar hukum pasar karbon sukarela dan wajib, serta membuka jalur menuju pajak karbon domestik.',
    'critical',
    ARRAY['carbon-economy','nek','pricing','srn-ppi'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '98/2021'
      AND ministry = 'Presidential'
);

-- ---------------------------------------------------------------------------
-- Row 4 — POJK 14/2023 — IDXCarbon legal basis
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2023-09-26',
    'OJK',
    'POJK',
    '14/2023',
    'Perdagangan Karbon melalui Bursa Karbon (IDXCarbon)',
    'https://ojk.go.id/id/regulasi/otoritas-jasa-keuangan/peraturan-ojk/Pages/Peraturan-OJK-Nomor-14-Tahun-2023-tentang-Perdagangan-Karbon-melalui-Bursa-Karbon.aspx',
    'Issued by OJK (Financial Services Authority), this regulation provided the legal and operational framework for carbon trading through a regulated exchange. It designated the Indonesia Stock Exchange (IDX) as the carbon exchange operator and set listing, trading, and transparency requirements.',
    'Diterbitkan OJK, regulasi ini menetapkan kerangka hukum dan operasional perdagangan karbon melalui bursa yang diawasi. Menunjuk Bursa Efek Indonesia (BEI) sebagai operator bursa karbon dan menetapkan persyaratan pencatatan, perdagangan, dan transparansi.',
    'critical',
    ARRAY['idxcarbon','carbon-exchange','ojk','compliance'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '14/2023'
      AND ministry = 'OJK'
);

-- ---------------------------------------------------------------------------
-- Row 5 — IDXCarbon launch day
-- Sentinel: document_number = 'N/A' (no formal regulatory document).
-- Dedupe key: (document_number, title, event_date) — wider key because N/A
-- could collide with future non-document rows if ministry-only key is used.
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2023-09-26',
    'IDX',
    'Launch',
    'N/A',
    'Peluncuran IDXCarbon — Bursa Karbon Indonesia',
    NULL, -- URL: not a regulatory document; no canonical URL at time of authoring
    'IDXCarbon, the Indonesia Carbon Exchange operated by the Indonesia Stock Exchange (IDX), opened for trading on 26 September 2023 — one of the first regulated carbon exchanges in Southeast Asia. Initial trading was restricted to domestic participants transacting Verra-issued VCUs from Indonesian forestry projects.',
    'IDXCarbon, Bursa Karbon Indonesia yang dioperasikan BEI, mulai beroperasi pada 26 September 2023 — salah satu bursa karbon terregulasi pertama di Asia Tenggara. Perdagangan awal dibatasi untuk peserta domestik yang bertransaksi VCU berstandar Verra dari proyek kehutanan Indonesia.',
    'high',
    ARRAY['idxcarbon','carbon-exchange','launch','idx'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = 'N/A'
      AND title = 'Peluncuran IDXCarbon — Bursa Karbon Indonesia'
      AND event_date = '2023-09-26'
);

-- ---------------------------------------------------------------------------
-- Rows 6 and 7 REMOVED on 2026-04-21 fact-check pass:
--   • Permenhut 7/2024 (SRN-PPI operationalization) — not found on
--     peraturan.bpk.go.id or jdih.menlhk.go.id; only Permenhut 1/2024 exists
--     for that year. Likely fabricated or mis-attributed (correct SRN-PPI
--     doc may be Permen LHK 7/2023, KLHK-issued; to be re-added only when
--     verified).
--   • Kepmen LH 20/2025 (DRAM/DPP) — not verifiable; Permenhut 20/2025
--     exists but is unrelated (forest-area planning). No DRAM/DPP Kepmen
--     found in any primary source.
-- Consequence: row count is 8, not 10. Self-validation and T15 filter
-- dynamic tag vocabulary remain correct.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Row 6 (post-correction) — Perpres 110/2025 — NEK framework overhaul
-- Fact-check 2026-04-21: date was 2025-04-22 (wrong); correct signing/
-- promulgation date per peraturan.go.id is 10 October 2025. Title +
-- scope corrected from "re-opening international trade" to the actual
-- consolidating-NEK-governance framing (international trade is one
-- consequence among many). Document URL added.
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2025-10-10',
    'Presidential',
    'Perpres',
    '110/2025',
    'Penyelenggaraan Instrumen Nilai Ekonomi Karbon dan Pengendalian Emisi GRK Nasional',
    'https://peraturan.go.id/id/perpres-no-110-tahun-2025',
    'Overhauls the national carbon-economy framework, replacing Perpres 98/2021. Consolidates governance of carbon pricing, emissions trading, and MRV under a single Presidential regulation. Enables international carbon credit trade under Article 6 of the Paris Agreement and sets the conditions for Indonesian credits to be sold to foreign buyers with proper authorisation. The most significant policy shift for the Indonesian carbon market since Perpres 98/2021.',
    'Menyempurnakan kerangka ekonomi karbon nasional, menggantikan Perpres 98/2021. Mengonsolidasikan tata kelola pricing karbon, perdagangan emisi, dan MRV dalam satu peraturan presiden. Memungkinkan perdagangan kredit karbon internasional berdasarkan Pasal 6 Perjanjian Paris dan menetapkan syarat penjualan kredit karbon Indonesia ke pembeli asing dengan otorisasi yang sesuai. Perubahan kebijakan paling signifikan bagi pasar karbon Indonesia sejak Perpres 98/2021.',
    'critical',
    ARRAY['nek','carbon-economy','international-trade','article6','presidential','framework'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '110/2025'
      AND ministry = 'Presidential'
);

-- ---------------------------------------------------------------------------
-- Row 7 (post-correction) — Permenhut 6/2026 — forestry offset trading procedures
-- Fact-check 2026-04-21: date was 2026-01-14 (wrong); correct promulgation
-- date per antaranews.com is 13 April 2026 (signed 6 April 2026). Title +
-- framing corrected: this is an implementing regulation for Perpres 110/
-- 2025 establishing forestry-offset trading procedures, not a moratorium
-- lift (no four-year moratorium appears in the verified legal record).
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2026-04-13',
    'Kemenhut',
    'Permenhut',
    '6/2026',
    'Tata Cara Perdagangan Karbon Melalui Offset Emisi GRK Sektor Kehutanan',
    'https://jdih.kehutanan.go.id/new2/home/portfolioDetails3/PERMENHUT_6_2026.pdf/6/2026/5/1341',
    'Implementing regulation for Perpres 110/2025 in the forestry sector. Establishes the procedures for carbon-credit generation, trading, and offset approvals from REDD+, peatland, mangrove, and afforestation projects. Signed by Menteri Kehutanan on 6 April 2026; promulgated 13 April 2026.',
    'Peraturan pelaksana Perpres 110/2025 untuk sektor kehutanan. Menetapkan tata cara penerbitan, perdagangan, dan persetujuan offset kredit karbon dari proyek REDD+, gambut, mangrove, dan penanaman hutan. Ditandatangani Menteri Kehutanan 6 April 2026; diundangkan 13 April 2026.',
    'critical',
    ARRAY['forestry','redd','peatland','offset','perpres-110-implementation'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '6/2026'
      AND ministry = 'Kemenhut'
);

-- ---------------------------------------------------------------------------
-- Row 8 (post-correction) — IDXCarbon full-scale launch (upcoming / unannounced)
-- Fact-check 2026-04-21: initial seed claimed event_date = 2026-07-01 as a
-- "forecast" — no official source supports that specific date. As of
-- January 2026 IEEFA reports that mandatory-compliance allowance
-- allocation has been delayed and no official launch date has been
-- announced by OJK or IDX. event_date now placeholder at 2026-12-31 (year-end)
-- and importance downgraded from 'high' → 'medium' to reflect uncertainty.
-- Sentinel: document_number = 'IDX-LAUNCH-2026' (unique identifiable sentinel).
-- Dedupe key: document_number alone (sentinel is globally unique, no collision risk).
-- When OJK announces the real date, delete this row and re-insert via a v2 seed.
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2026-12-31', /* placeholder; no official launch date announced as of 2026-04-21 */
    'IDX',
    'Launch',
    'IDX-LAUNCH-2026',
    'IDXCarbon Peluncuran Skala Penuh (tanggal belum diumumkan)',
    NULL, -- URL: not yet available; update when OJK publishes rulemaking
    'IDXCarbon''s full-scale launch, expanding from the 2023 soft-launch to support mandatory-compliance trading with OJK-allocated allowances. As of early 2026, allowance allocation has been delayed; no official launch date announced. event_date is placeholder (2026-12-31) pending announcement.',
    'Peluncuran skala penuh IDXCarbon, memperluas dari soft-launch 2023 untuk mendukung perdagangan wajib dengan alokasi izin OJK. Per awal 2026 alokasi izin tertunda; tanggal peluncuran resmi belum diumumkan. event_date berupa placeholder (2026-12-31) sampai ada pengumuman resmi.',
    'medium',
    ARRAY['idxcarbon','international','launch','upcoming','unannounced'],
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = 'IDX-LAUNCH-2026'
);

-- ---------------------------------------------------------------------------
-- Self-validation: importance must be one of critical|high|medium|low
-- If any row has a misspelled value, this assertion fails and --single-transaction
-- rolls back the entire file. (importance has no CHECK constraint in the schema.)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  ASSERT (SELECT COUNT(*) FROM regulatory_events
          WHERE importance NOT IN ('critical', 'high', 'medium', 'low')) = 0,
    'regulatory_events.importance must be one of critical/high/medium/low';
END $$;
