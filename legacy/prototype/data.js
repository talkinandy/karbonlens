// Mock data for KarbonLens prototype
window.KL_DATA = {
  projects: [
    {
      id: 'katingan-peatland',
      name: 'Katingan Peatland Restoration',
      shortName: 'Katingan Peatland',
      developer: 'Rimba Makmur Utama',
      type: 'REDD+',
      subtype: 'Peatland',
      province: 'Central Kalimantan',
      provinceShort: 'C. Kalimantan',
      provinceId: 'Kalimantan Tengah',
      hectares: 149800,
      centroid: [-1.8, 113.2],
      status: 'active',
      score: 82,
      breakdown: { validation: 90, reversal: 72, community: 85, transparency: 80 },
      issued: '32.5M',
      retired: '28.9M',
      available: '3.6M',
      availableSort: 3600000,
      lastVintage: 2020,
      registries: ['Verra', 'SRN-PPI'],
      registriesShort: 'V · SRN',
      issuances: [
        { year: 2017, value: 5.8 },
        { year: 2018, value: 7.9 },
        { year: 2019, value: 9.5 },
        { year: 2020, value: 8.7 }
      ],
      alerts: [
        { x: 170, y: 80, conf: 'high' },
        { x: 215, y: 110, conf: 'high' },
        { x: 305, y: 90, conf: 'high' },
        { x: 250, y: 145, conf: 'nominal' },
        { x: 340, y: 155, conf: 'nominal' }
      ],
      news: [
        { sentiment: 'positive', title: 'Katingan signs fresh offtake with Japanese trading house at implied US$9.2/tCO₂e', source: 'Mongabay', daysAgo: 3 },
        { sentiment: 'warning', title: 'RADD alert fired: 1.8 ha canopy loss in northeast quadrant', source: 'GFW', daysAgo: 6 },
        { sentiment: 'neutral', title: 'Kemenhut publishes Permenhut 6/2026 — forestry credits re-enabled for SRUK registration', source: 'JDIH', daysAgo: 14 },
        { sentiment: 'neutral', title: 'Rimba Makmur Utama to deploy additional fire monitoring towers across eastern blocks', source: 'Press release', daysAgo: 21 }
      ]
    },
    { id: 'sumatra-merang', shortName: 'Sumatra Merang', name: 'Sumatra Merang Peatland Project', developer: 'Forest Carbon', type: 'Peatland', province: 'South Sumatra', provinceShort: 'S. Sumatra', hectares: 22900, status: 'active', score: 74, available: '1.2M', availableSort: 1200000, registries: ['Verra', 'SRN-PPI'], registriesShort: 'V · SRN' },
    { id: 'muara-teweh', shortName: 'Muara Teweh Conservation', name: 'Muara Teweh Conservation', developer: 'Fairatmos + South Pole', type: 'REDD+', province: 'Central Kalimantan', provinceShort: 'C. Kalimantan', hectares: 41000, status: 'pipeline', score: 68, available: 'Pipeline', availableSort: 0, registries: ['Verra', 'SRN-PPI'], registriesShort: 'V · SRN' },
    { id: 'pesisir-biru', shortName: 'Pesisir Biru Nusantara', name: 'Pesisir Biru Nusantara', developer: 'Multi-site mangrove', type: 'Blue Carbon', province: 'Multiple', provinceShort: 'Multiple', hectares: 8500, status: 'pipeline', score: 65, available: 'Pipeline', availableSort: 0, registries: ['SRN-PPI'], registriesShort: 'SRN' },
    { id: 'rimba-raya', shortName: 'Rimba Raya Conservation', name: 'Rimba Raya Conservation', developer: 'PT Rimba Raya', type: 'REDD+', province: 'Central Kalimantan', provinceShort: 'C. Kalimantan', hectares: 36000, status: 'flagged', score: 58, available: '4.1M', availableSort: 4100000, registries: ['Verra'], registriesShort: 'V' },
    { id: 'pertamina-lahendong', shortName: 'Pertamina Geothermal Lahendong', name: 'Pertamina Geothermal Lahendong', developer: 'Pertamina Geothermal', type: 'Geothermal', province: 'North Sulawesi', provinceShort: 'N. Sulawesi', hectares: 0, status: 'active', score: 79, available: '845k', availableSort: 845000, registries: ['SRN-PPI', 'IDXCarbon'], registriesShort: 'SRN · IDX' },
    { id: 'pltgu-muara-karang', shortName: 'PLTGU Muara Karang', name: 'PLTGU Muara Karang', developer: 'PLN Indonesia Power', type: 'Gas power', province: 'Jakarta', provinceShort: 'Jakarta', hectares: 0, status: 'active', score: 71, available: '312k', availableSort: 312000, registries: ['SRN-PPI', 'IDXCarbon'], registriesShort: 'SRN · IDX' },
    { id: 'pltm-gunung-wugul', shortName: 'PLTM Gunung Wugul', name: 'PLTM Gunung Wugul', developer: 'PT Cahaya Listrik', type: 'Hydro', province: 'Central Java', provinceShort: 'C. Java', hectares: 0, status: 'active', score: 69, available: '184k', availableSort: 184000, registries: ['SRN-PPI', 'IDXCarbon'], registriesShort: 'SRN · IDX' },
    { id: 'cendrawasih-aru', shortName: 'Cendrawasih Aru Conservation', name: 'Cendrawasih Aru Conservation', developer: '(under review)', type: 'REDD+', province: 'Maluku', provinceShort: 'Maluku', hectares: 12000, status: 'suspended', score: 42, available: 'Suspended', availableSort: -1, registries: ['Verra'], registriesShort: 'V' },
    { id: 'bukit-tigapuluh', shortName: 'Bukit Tigapuluh Ecosystem', name: 'Bukit Tigapuluh Ecosystem', developer: 'PT Alam Bukit Tigapuluh', type: 'REDD+', province: 'Riau / Jambi', provinceShort: 'Riau / Jambi', hectares: 38000, status: 'active', score: 77, available: '2.8M', availableSort: 2800000, registries: ['Verra', 'SRN-PPI'], registriesShort: 'V · SRN' }
  ],
  priceStats: {
    janValue: 'Rp 4.7B',
    janValueDelta: '↓ 36% vs Dec',
    volume: '117k t',
    volumeDelta: '↓ 38% vs Dec',
    avgPrice: 'Rp 40k',
    avgPriceDelta: '≈ US$2.50/t',
    participants: '132',
    participantsDelta: '↑ 4 in month'
  },
  priceSeries: {
    months: ['Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan 26'],
    'IDTBS-RE': [60, 58, 55, 62, 68, 64],
    'IDTBS':    [40, 41, 39, 40, 42, 38],
    'IDNBS':    [38, null, 37, null, 39, 38]
  },
  transactions: [
    { date: '29 Jan', market: 'Negotiated', creditType: 'IDTBS', project: 'Pertamina Lahendong', volume: '100,000 t', price: 'Rp 37,500' },
    { date: '22 Jan', market: 'Negotiated', creditType: 'IDTBS-RE', project: 'PLTM Gunung Wugul', volume: '16,596 t', price: 'Rp 54,000' },
    { date: '15 Jan', market: 'Marketplace', creditType: 'IDTBS-RE', project: 'PLTGU Muara Karang', volume: '846 t', price: 'Rp 64,100' },
    { date: '9 Jan',  market: 'Negotiated', creditType: 'IDTBS', project: 'Pertamina Lahendong', volume: '45,000 t', price: 'Rp 38,200' }
  ],
  regulatory: [
    {
      date: '13 Apr 2026', status: 'Diundangkan',
      title: 'Permenhut 6/2026 — Tata Cara Perdagangan Karbon Offset GRK Kehutanan',
      desc: 'Implements forestry offset pathway under Perpres 110/2025. Re-enables forestry REDD+/peatland credits after 4-year freeze. Establishes eligible actors (PBPH, perhutanan sosial, hutan adat, hutan hak, PB-PJL Karbon), registered mitra/pendamping requirement, Padiatapa mandate, Nesting requirement, and PNBP on transactions.',
      importance: 'critical', importanceLabel: 'Critical', tags: ['Kemenhut', 'Forestry', 'REDD+']
    },
    {
      date: 'Oct 2025', status: 'Diundangkan',
      title: 'Perpres 110/2025 — Penyelenggaraan Instrumen NEK',
      desc: 'Replaces Perpres 98/2021. Establishes SRUK (Sistem Registri Unit Karbon) alongside SRN-PPI, introduces Corresponding Adjustment framework, re-opens international carbon trade after 2021 moratorium.',
      importance: 'critical', importanceLabel: 'Critical', tags: ['Presidential', 'All sectors']
    },
    {
      date: 'Oct 2025', status: 'MoU signed',
      title: 'Verra–Indonesia Mutual Recognition Agreement',
      desc: 'VCS projects may pursue parallel registration with SRN-PPI. VCUs remain in Verra Registry but mirrored in SRN-PPI for NDC accounting. Dual-track process operational.',
      importance: 'high', importanceLabel: 'High', tags: ['KLH', 'International']
    },
    {
      date: 'Aug 2025', status: 'Launched',
      title: 'SRN-PPI v2 — Upgraded climate registry',
      desc: 'Improved data visualization, streamlined verification procedures, enhanced NDC tracking. API access roadmap announced.',
      importance: 'medium', importanceLabel: 'Medium', tags: ['KLH']
    },
    {
      date: 'Jan 2025', status: 'Opened',
      title: 'IDXCarbon opens to international buyers',
      desc: 'First international transactions: ~41,822 tCO₂e on day one. Natural gas credits traded at ~US$5.87/ton, hydroelectric at US$8.82/ton.',
      importance: 'high', importanceLabel: 'High', tags: ['OJK', 'IDX']
    },
    {
      date: 'Expected Q3 2026', status: 'Upcoming',
      title: 'PNBP rate determination (Permenhut follow-up)',
      desc: 'Rate for Non-Tax State Revenue on carbon trading transactions (mandated by Permenhut 6/2026 Pasal 46) expected to be set via separate Permen. Industry estimates 10–20% of gross transaction value.',
      importance: 'high', importanceLabel: 'High', tags: ['Upcoming', 'Kemenhut']
    },
    {
      date: 'Expected Oct 2026', status: 'Upcoming',
      title: 'Fiscal regime & buffer mechanism Permen',
      desc: 'Technical parameters for buffer pool contributions, fiscal treatment of CA-authorized credits, and ITMO accounting.',
      importance: 'medium', importanceLabel: 'Medium', tags: ['Upcoming', 'Multi-ministry']
    }
  ],
  alerts: [
    { id: 1, type: 'reversal', severity: 'warning', typeLabel: 'Reversal warning', project: 'Sumatra Merang', time: '06:42 today', read: false, title: 'Deforestation detected: 2.4 ha canopy loss', desc: 'RADD high-confidence alert inside project polygon. Third alert this quarter.' },
    { id: 2, type: 'price', severity: 'info', typeLabel: 'Price', project: 'IDTBS-RE', time: '2h ago', read: false, title: 'IDTBS-RE crossed Rp 55,000 threshold', desc: 'Latest marketplace transaction at Rp 64,100/ton, 4% above your configured threshold.' },
    { id: 3, type: 'regulatory', severity: 'danger', typeLabel: 'Regulatory', project: 'Kemenhut', time: '1d ago', read: false, title: 'Permenhut 6/2026 published to JDIH', desc: 'Forestry offset pathway now implementable. Affects 48 of your watched projects.' },
    { id: 4, type: 'news', severity: 'info', typeLabel: 'News', project: 'Katingan Peatland', time: '3d ago', read: true, title: 'Fresh offtake signed with Japanese trading house', desc: 'Reported implied price US$9.2/tCO₂e for vintage 2020 credits. Source: Mongabay.' },
    { id: 5, type: 'reversal', severity: 'warning', typeLabel: 'Reversal warning', project: 'Rimba Raya', time: '5d ago', read: true, title: 'Fire alert cluster detected near eastern boundary', desc: 'VIIRS thermal anomaly, 3 hotspots within 2km of project polygon.' },
    { id: 6, type: 'retirement', severity: 'info', typeLabel: 'Retirement', project: 'Katingan Peatland', time: '1w ago', read: true, title: '450,000 VCUs retired by large corporate buyer', desc: 'Vintage 2019 credits retired for 2024 inventory offset. Beneficiary undisclosed.' },
    { id: 7, type: 'issuance', severity: 'success', typeLabel: 'Issuance', project: 'Pertamina Lahendong', time: '1w ago', read: true, title: 'New issuance: 125,000 VCUs vintage 2024', desc: 'SPE-GRK issued by Ministry of Environment. Available for trading on IDXCarbon.' }
  ]
};
