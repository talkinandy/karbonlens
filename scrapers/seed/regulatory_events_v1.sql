-- =============================================================================
-- T10: Seed regulatory_events — 10 curated Indonesian carbon-market milestones
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
    'Badan Pengendalian Perubahan Iklim (DNPI)',
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
-- Row 6 — Permenhut 7/2024 — SRN-PPI registry operationalization
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2024-07-08',
    'Kemenhut',
    'Permenhut',
    '7/2024',
    'Operasionalisasi Registri SRN-PPI',
    NULL, -- URL: not found at time of authoring; check peraturan.bpk.go.id
    'Operationalised the SRN-PPI national carbon registry for the forestry sector, setting out the procedures for project registration, issuance of carbon units, and data reporting obligations. Required all forest-carbon projects to list through SRN-PPI as a condition for trading on IDXCarbon.',
    'Mengoperasionalkan registri karbon nasional SRN-PPI untuk sektor kehutanan, mengatur tata cara pendaftaran proyek, penerbitan unit karbon, dan kewajiban pelaporan data. Mewajibkan seluruh proyek karbon hutan mendaftar melalui SRN-PPI sebagai syarat untuk diperdagangkan di IDXCarbon.',
    'medium',
    ARRAY['srn-ppi','registry','forestry','mrvb'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '7/2024'
      AND ministry = 'Kemenhut'
);

-- ---------------------------------------------------------------------------
-- Row 7 — Kepmen LH 20/2025 — DRAM/DPP data portals
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2025-03-15',
    'Kementerian LH',
    'Kepmen',
    '20/2025',
    'DRAM/DPP — Pendaftaran dan Portal Data Iklim',
    NULL, -- URL: not found at time of authoring; check peraturan.bpk.go.id
    'Established the DRAM (Daftar Rencana Aksi Mitigasi) and DPP (Data Pendukung Pemantauan) data portals under the Ministry of Environment (KLH), centralising MRV reporting for all registered GHG mitigation actions and linking SRN-PPI data to the national GHG inventory.',
    'Menetapkan portal data DRAM dan DPP di bawah Kementerian Lingkungan Hidup, memusatkan pelaporan MRV untuk seluruh aksi mitigasi GRK yang terdaftar dan menghubungkan data SRN-PPI ke inventaris GRK nasional.',
    'medium',
    ARRAY['registry','dram','data-portal','klh'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '20/2025'
      AND ministry = 'Kementerian LH'
);

-- ---------------------------------------------------------------------------
-- Row 8 — Perpres 110/2025 — re-opening international carbon credit trade
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2025-04-22',
    'Presidential',
    'Perpres',
    '110/2025',
    'Pembukaan Kembali Perdagangan Kredit Karbon Internasional',
    NULL, -- URL: not found at time of authoring; check peraturan.bpk.go.id
    'Re-opened international carbon credit trade after a period of restriction, establishing the conditions and approval pathway for Indonesian carbon credits to be sold to foreign buyers under Article 6 of the Paris Agreement. A landmark shift that significantly increases the addressable market for Indonesian project developers.',
    'Membuka kembali perdagangan kredit karbon internasional setelah masa pembatasan, menetapkan syarat dan jalur persetujuan agar kredit karbon Indonesia dapat dijual ke pembeli asing berdasarkan Pasal 6 Perjanjian Paris. Perubahan penting yang secara signifikan memperluas pasar bagi pengembang proyek Indonesia.',
    'critical',
    ARRAY['international-trade','carbon-credits','article6','presidential'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '110/2025'
      AND ministry = 'Presidential'
);

-- ---------------------------------------------------------------------------
-- Row 9 — Permenhut 6/2026 — re-enabling forestry carbon credits
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2026-01-14',
    'Kemenhut',
    'Permenhut',
    '6/2026',
    'Pencabutan Moratorium Kredit Karbon Kehutanan',
    NULL, -- URL: not found at time of authoring; check peraturan.bpk.go.id
    'Lifted the four-year moratorium on new forestry carbon credit approvals (in force since early 2022), re-enabling REDD+, peatland, and conservation projects to seek certification and trade on IDXCarbon. Widely regarded as the regulatory unlock most needed to scale Indonesia''s carbon market in 2026.',
    'Mencabut moratorium empat tahun atas persetujuan kredit karbon kehutanan baru (berlaku sejak awal 2022), memungkinkan kembali proyek REDD+, gambut, dan konservasi untuk mendapatkan sertifikasi dan diperdagangkan di IDXCarbon. Dianggap sebagai pembukaan regulasi yang paling dibutuhkan untuk mengembangkan pasar karbon Indonesia pada 2026.',
    'critical',
    ARRAY['forestry','redd','peatland','moratorium-lifted'],
    FALSE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = '6/2026'
      AND ministry = 'Kemenhut'
);

-- ---------------------------------------------------------------------------
-- Row 10 — IDXCarbon full-scale launch (upcoming / forecast)
-- event_date = 2026-07-01: forecast placeholder (first-of-month convention).
-- /* forecast; update when announced */
-- Sentinel: document_number = 'IDX-LAUNCH-2026' (unique identifiable sentinel).
-- Dedupe key: (document_number, title, event_date) — wider key used because
-- the sentinel is not a real document number and could theoretically collide
-- if another forecast row is added with the same sentinel pattern.
-- When OJK announces the real launch date and/or document, delete this row
-- and insert a corrected row via regulatory_events_v2.sql.
-- ---------------------------------------------------------------------------
INSERT INTO regulatory_events (
    event_date, ministry, document_type, document_number,
    title, document_url, summary_en, summary_id,
    importance, tags, is_upcoming
)
SELECT
    '2026-07-01', /* forecast; update when announced */
    'IDX',
    'Launch',
    'IDX-LAUNCH-2026',
    'IDXCarbon Peluncuran Skala Penuh — Peserta Internasional',
    NULL, -- URL: not yet available; update when OJK publishes rulemaking
    'Forecast mid-2026 opening of IDXCarbon to international participants, following the 2025 Perpres that re-enabled international carbon credit trade. Expected to significantly increase liquidity and price discovery on the exchange. Exact date subject to OJK rulemaking.',
    'Perkiraan pembukaan IDXCarbon untuk peserta internasional pada pertengahan 2026, menyusul Perpres 2025 yang membuka kembali perdagangan kredit karbon internasional. Diharapkan meningkatkan likuiditas dan price discovery secara signifikan. Tanggal pasti menunggu aturan pelaksanaan OJK.',
    'high',
    ARRAY['idxcarbon','international','launch','upcoming'],
    TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM regulatory_events
    WHERE document_number = 'IDX-LAUNCH-2026'
      AND title = 'IDXCarbon Peluncuran Skala Penuh — Peserta Internasional'
      AND event_date = '2026-07-01'
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
