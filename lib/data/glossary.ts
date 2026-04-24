/**
 * lib/data/glossary.ts — KarbonLens glossary terms (T32, Phase 3).
 *
 * Hardcoded dictionary of ~22 carbon-market terms surfaced at /glossary
 * and /glossary/[term]. Pure data — no DB, no fetch. Sorted on read by
 * term then category so the index page can group cleanly.
 *
 * Each entry has a canonical `term` label, a URL `slug`, optional
 * `aliases` for alt-spelling search, a one-sentence `short` (used in
 * cards + meta description) and a 60–150 word `long` (paragraph
 * separated by blank lines). `category` drives section grouping.
 *
 * The list is curated from widely-known carbon-market primitives —
 * VCS methodologies (VM####), CDM methodologies (ACM####, AMS-III.X),
 * Indonesian regulatory units (SRN-PPI, SPE-GRK, IDXCarbon, BPDLH),
 * and shorthand acronyms (REDD+, ARR, CCB, POME, CDM, Permenhut,
 * Perpres). Authority links point at primary registry/regulator pages
 * where one is unambiguous; some (POME, Permenhut, Perpres, BPDLH,
 * IDXCarbon) intentionally omit `authoritySource` because no single
 * canonical English-language landing page captures the concept.
 */

export type GlossaryTerm = {
  /** URL slug (lowercase, hyphenated). */
  slug: string;
  /** Canonical label as it appears in the heading and cards. */
  term: string;
  /** Alternate spellings / expansions for search and JSON-LD alternateName. */
  aliases?: string[];
  /** One-sentence definition (<=40 words). Used in cards + meta description. */
  short: string;
  /** 2–4 paragraph explainer, paragraphs separated by blank lines. 60–150 words. */
  long: string;
  /** Group bucket on the index page. */
  category: 'methodology' | 'registry' | 'regulation' | 'market' | 'technical';
  /** Other slugs to link as related pills. */
  relatedTerms?: string[];
  /** Single authoritative external source if one exists. */
  authoritySource?: { url: string; title: string };
};

export const GLOSSARY: GlossaryTerm[] = [
  // ── Methodologies ─────────────────────────────────────────────────────────
  {
    slug: 'vm0007',
    term: 'VM0007',
    aliases: ['REDD+ Methodology Framework', 'REDD-MF'],
    short:
      "Verra's modular REDD+ Methodology Framework, current version 1.8, covering avoided unplanned/planned deforestation and afforestation/reforestation activities under VCS.",
    long:
      "VM0007 is the long-running modular framework Verra has used since 2011 to credit REDD+ projects under the Verified Carbon Standard. Successive revisions added Avoided Unplanned Deforestation (AUD), Avoided Planned Deforestation (APD), and Afforestation/Reforestation/Revegetation modules, plus extensions for peatland rewetting and tidal-wetland restoration. The framework reached version 1.8, and its peat and wetland sub-modules dominated Indonesian VCS issuance for years.\n\nVerra is now transitioning new project registrations away from VM0007 toward consolidated successor methodologies — VM0048 for unplanned deforestation, VM0033 for tidal wetlands, VM0047 for ARR — so VM0007 is largely a legacy framework for projects already in their crediting period. ICVCM has not granted Core Carbon Principle eligibility to VM0007 itself; assessment focused on the consolidated successors.",
    category: 'methodology',
    relatedTerms: ['vm0048', 'vm0033', 'vm0047', 'redd-plus'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0007-redd-methodology-framework-redd-mf-v1-8/',
      title: 'VM0007 v1.8 — Verra',
    },
  },
  {
    slug: 'vm0048',
    term: 'VM0048',
    aliases: ['Consolidated REDD Methodology', 'Reducing Emissions from Deforestation and Forest Degradation'],
    short:
      "Verra's consolidated REDD methodology launched November 2023, replacing the AUD/APD modules of VM0007 with a single jurisdictional-baseline approach.",
    long:
      "VM0048 is the consolidated REDD methodology Verra published in November 2023 to replace the patchwork of avoided-deforestation modules previously housed in VM0007 (AUD, APD, AR-AUD). It introduces a more centralised, jurisdictional approach to baseline setting, with allocated deforestation risk derived from a common dataset rather than project-by-project remote sensing.\n\nThe first activity module under VM0048 is VMD0055 for Avoided Unplanned Deforestation. Verra has signalled that new REDD project registrations should use VM0048 rather than VM0007 going forward, and existing VM0007 projects face transition timelines on subsequent verifications. The consolidated methodology is designed to address ICVCM Core Carbon Principle critiques about baseline inflation in the older VCS REDD literature.",
    category: 'methodology',
    relatedTerms: ['vm0007', 'redd-plus'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0048-reducing-emissions-from-deforestation-and-forest-degradation-v1-0/',
      title: 'VM0048 v1.0 — Verra',
    },
  },
  {
    slug: 'vm0033',
    term: 'VM0033',
    aliases: ['Tidal Wetland and Seagrass Restoration'],
    short:
      "Verra's blue-carbon methodology for restoration of tidal wetlands, mangroves, and seagrass meadows, with peat-rewetting modules.",
    long:
      'VM0033 is the Verified Carbon Standard methodology covering restoration of tidal wetland and seagrass ecosystems — mangrove afforestation/reforestation, salt-marsh restoration, peat rewetting, and seagrass meadow recovery. It is the dominant methodology for blue-carbon projects in Indonesia, where mangrove rehabilitation along Kalimantan, Sulawesi, and Papua coastlines has attracted project developer interest at scale.\n\nVerra has revised VM0033 multiple times to harmonise quantification with newer remote-sensing data and to absorb peatland rewetting activities that were historically handled under VM0007 wetland sub-modules (those VM0007 modules have been progressively inactivated). VM0033 sits alongside VM0047 (terrestrial ARR) as the active removal-side methodology family within the VCS programme.',
    category: 'methodology',
    relatedTerms: ['vm0007', 'vm0047', 'arr'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0033-methodology-for-tidal-wetland-and-seagrass-restoration-v2-1/',
      title: 'VM0033 — Verra',
    },
  },
  {
    slug: 'vm0047',
    term: 'VM0047',
    aliases: ['Afforestation, Reforestation and Revegetation'],
    short:
      "Verra's consolidated ARR methodology, activated May 2025, using dynamic remote-sensing benchmarks; ICVCM CCP-approved.",
    long:
      "VM0047 is the consolidated Afforestation, Reforestation and Revegetation methodology that Verra activated in May 2025 to replace the legacy CDM AR-ACM0003 large-scale and AR-AMS0007 small-scale methodologies that had been carried over into the VCS programme. It introduces dynamic, remote-sensing-derived performance benchmarks rather than static project-level baselines, reducing the scope for over-crediting.\n\nVM0047 was among the first methodologies to receive Core Carbon Principle eligibility from the Integrity Council for the Voluntary Carbon Market (ICVCM CCP-approved). It is the reference methodology for new tree-planting and revegetation projects under VCS, including Indonesian smallholder ARR projects that previously sat under the inactivating CDM A/R methodologies.",
    category: 'methodology',
    relatedTerms: ['arr', 'vm0033'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0047-afforestation-reforestation-and-revegetation-v1-0/',
      title: 'VM0047 v1.0 — Verra',
    },
  },
  {
    slug: 'vm0010',
    term: 'VM0010',
    aliases: ['Improved Forest Management — Logged to Protected Forest', 'IFM LtPF'],
    short:
      "Verra's Improved Forest Management methodology for converting logging concessions to protected forest, recently revised and ICVCM-endorsed.",
    long:
      'VM0010 covers Improved Forest Management projects that convert a working logging concession into a protected forest, generating credits from the avoided emissions of logging that would otherwise have occurred. It is one of several IFM methodologies in the Verra catalogue (alongside VM0003, VM0011, VM0012) and is most relevant to natural production forests in tropical jurisdictions.\n\nVerra revised VM0010 to tighten baseline setting and to align quantification with newer biomass-loss datasets. The revised version received Core Carbon Principle endorsement from ICVCM, marking IFM Logged-to-Protected as one of the activity types that can carry the CCP label. In the Indonesian context this matters mainly for large concession-based projects in Kalimantan and Papua.',
    category: 'methodology',
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0010-methodology-for-improved-forest-management-conversion-from-logged-to-protected-forest-v1-3/',
      title: 'VM0010 — Verra',
    },
  },
  {
    slug: 'vm0044',
    term: 'VM0044',
    aliases: ['Methodology for Biochar Utilization'],
    short:
      "Verra's biochar methodology, version 1.2 active from June 2025 and ICVCM CCP-approved, crediting durable carbon storage in soils and materials.",
    long:
      'VM0044 is the Verified Carbon Standard methodology for crediting biochar production and utilisation. Biochar — a stable, charcoal-like product made from pyrolysing biomass — is treated as long-term carbon storage when applied to soils, used as a concrete additive, or otherwise locked into durable end-uses. The methodology quantifies the durable fraction and discounts for permanence.\n\nVersion 1.2 of VM0044 became active in June 2025 and was among the early methodologies to receive ICVCM Core Carbon Principle eligibility, validating the engineered-removal pathway. In the Indonesian context, biochar projects are still nascent, but agricultural-residue feedstocks (rice husk, palm-shell biomass) make it a plausible adjacency to existing AFOLU and bioenergy operations.',
    category: 'methodology',
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0044-methodology-for-biochar-utilization-in-soil-and-non-soil-applications-v1-2/',
      title: 'VM0044 v1.2 — Verra',
    },
  },
  {
    slug: 'vm0051',
    term: 'VM0051',
    aliases: ['Improved Management in Rice Production Systems'],
    short:
      "Verra's rice-cultivation methodology active February 2025, replacing CDM AMS-III.AU with dual-gas CH4+N2O monitoring and AWD water management.",
    long:
      'VM0051 is the Verified Carbon Standard methodology for crediting Improved Management in Rice Production Systems. It became active in February 2025 and is the consolidated successor to the CDM small-scale methodology AMS-III.AU, which Verra had carried over for rice projects.\n\nThe methodology requires dual-gas monitoring of both methane (CH4) — the dominant emission from flooded paddies — and nitrous oxide (N2O), which can rise as paddies are drained. Its centrepiece is Alternate Wetting and Drying (AWD) irrigation, where paddies are intermittently dried rather than continuously flooded, dramatically reducing methane while requiring careful N2O accounting. VM0051 is directly relevant to Indonesian wet-rice systems on Java and Sulawesi.',
    category: 'methodology',
  },
  {
    slug: 'vmr0006',
    term: 'VMR0006',
    aliases: ['Energy Efficiency and Fuel Switch Measures in Thermal Applications'],
    short:
      'Legacy Verra clean-cookstove methodology superseded in October 2024 by VM0050; withdrawn from ICVCM CCP assessment after the C-Quest Capital integrity scandal.',
    long:
      'VMR0006 was the Verra Registered Methodology used by most clean-cookstove projects, in particular the high-efficiency firewood cookstove activity type. It was the methodological basis for a large pipeline of credits issued in sub-Saharan Africa and Southeast Asia and was under active ICVCM Core Carbon Principle assessment.\n\nIn October 2024 Verra superseded VMR0006 with the new VM0050 methodology, citing the need for tighter usage-rate assumptions and stove-stacking accounting after independent academic and journalistic scrutiny — culminating in the C-Quest Capital integrity disclosures — found that real-world emission reductions were systematically lower than VMR0006 had credited. VMR0006 was withdrawn from the ICVCM CCP assessment process and is no longer an eligible methodology for new project registrations.',
    category: 'methodology',
  },
  {
    slug: 'vmr0014',
    term: 'VMR0014',
    aliases: ['Electric and Hybrid Vehicles'],
    short:
      'Verra electric and hybrid vehicle methodology effective July 2025, replacing CDM AMS-III.C, which inactivates in August 2026.',
    long:
      'VMR0014 is the Verra Registered Methodology covering greenhouse-gas reductions from the deployment of electric and hybrid road vehicles. It is the revised, Verra-owned version of CDM AMS-III.C ("Emission reductions by electric and hybrid vehicles"), which Verra had carried over from the Clean Development Mechanism.\n\nVMR0014 became effective in July 2025. The underlying CDM AMS-III.C is scheduled to be fully inactivated in August 2026, after which all VCS electric-vehicle and hybrid-fleet projects must use VMR0014 for new monitoring periods. The methodology covers fleet electrification, two- and three-wheeler swaps, and grid-charged passenger vehicles where the displaced fossil baseline can be defensibly established.',
    category: 'methodology',
    relatedTerms: ['cdm'],
  },
  {
    slug: 'acm0002',
    term: 'ACM0002',
    aliases: ['Grid-Connected Electricity Generation from Renewable Sources'],
    short:
      "The CDM's large-scale consolidated methodology for grid-connected renewable electricity — hydro, wind, solar, geothermal, and tidal feeders.",
    long:
      'ACM0002 is the CDM Approved Consolidated Methodology for grid-connected electricity generation from renewable sources. It covers utility-scale hydro, wind, solar PV and CSP, geothermal, and tidal generators that feed an interconnected grid, calculating reductions against a combined-margin grid emission factor.\n\nIt is the most-used large-scale CDM methodology in history and underpinned a substantial share of pre-2020 CER issuance from Indonesian, Indian, and Chinese renewable plants. With CDM transitioning to the Article 6.4 Paris Agreement Crediting Mechanism, many ACM0002 projects have either reached the end of their crediting periods or have transitioned to voluntary registries; new large hydro and grid-renewable issuance under the original CDM has effectively wound down.',
    category: 'methodology',
    relatedTerms: ['cdm'],
  },
  {
    slug: 'ams-iii-h',
    term: 'AMS-III.H',
    aliases: ['Methane recovery in wastewater treatment'],
    short:
      "The CDM's small-scale methodology for methane recovery in wastewater treatment, capped at 60 ktCO2e/yr, current version 19 — the standard POME biogas methodology.",
    long:
      'AMS-III.H is the CDM small-scale methodology for methane recovery in wastewater treatment systems. It is capped at 60 ktCO2e per year (the small-scale threshold) and is currently in version 19. The methodology covers the capture and combustion or beneficial use of methane that would otherwise be emitted from anaerobic decomposition of high-COD organic wastewaters.\n\nIn the Indonesian context AMS-III.H is the workhorse methodology for Palm Oil Mill Effluent (POME) biogas projects: covered anaerobic lagoons or CSTR digesters that capture methane from the POME stream and either flare it or use it for power generation and grid export. Many such projects originated under CDM and migrated to the voluntary market.',
    category: 'methodology',
    relatedTerms: ['cdm', 'pome'],
  },

  // ── Technical / market primitives ────────────────────────────────────────
  {
    slug: 'pome',
    term: 'POME',
    aliases: ['Palm Oil Mill Effluent'],
    short:
      'The high-COD liquid effluent from crude palm oil milling; methane from open-lagoon decay is a major Indonesian carbon-project target.',
    long:
      'POME — Palm Oil Mill Effluent — is the high chemical-oxygen-demand (high-COD) wastewater stream produced when fresh fruit bunches are processed into crude palm oil. A typical mill generates roughly 2.5–3.0 m³ of POME per tonne of crude palm oil, and the stream is conventionally treated in a cascade of open anaerobic lagoons before discharge.\n\nThose open lagoons are highly methanogenic: anaerobic decomposition of the organic load releases substantial volumes of methane, a potent short-lived greenhouse gas. Indonesian carbon projects target this methane stream by retrofitting covered lagoons or CSTR digesters that capture the biogas for flaring or for power generation feeding into the grid or the mill itself, typically credited under CDM AMS-III.H or VCS analogues.',
    category: 'technical',
    relatedTerms: ['ams-iii-h', 'cdm'],
  },
  {
    slug: 'cdm',
    term: 'CDM',
    aliases: ['Clean Development Mechanism'],
    short:
      "UNFCCC's Kyoto-era project-based crediting mechanism, winding down and transitioning to the Article 6.4 mechanism under the Paris Agreement.",
    long:
      'The Clean Development Mechanism is the project-based crediting mechanism established under the Kyoto Protocol that allowed industrialised countries (Annex I parties) to meet a portion of their emission-reduction commitments by financing projects in developing countries, in exchange for Certified Emission Reduction units (CERs).\n\nWith the Kyoto Protocol superseded by the Paris Agreement, the CDM is winding down. New activity has effectively ended and the institutional infrastructure is being repurposed under the Article 6.4 Paris Agreement Crediting Mechanism (PACM, sometimes A6.4M). Many Indonesian CDM projects — particularly POME biogas and grid renewable installations — have reached the end of their original crediting periods and either transitioned into voluntary standards (VCS, GS) or are being assessed for Article 6.4 transition.',
    category: 'market',
    relatedTerms: ['acm0002', 'ams-iii-h'],
    authoritySource: {
      url: 'https://cdm.unfccc.int/',
      title: 'CDM — UNFCCC',
    },
  },
  {
    slug: 'redd-plus',
    term: 'REDD+',
    aliases: ['Reducing Emissions from Deforestation and forest Degradation'],
    short:
      'UNFCCC framework for crediting avoided emissions from deforestation and degradation, plus the "+" enhancements: conservation, sustainable management, and forest-stock enhancement.',
    long:
      'REDD+ stands for Reducing Emissions from Deforestation and forest Degradation in developing countries, with the "+" denoting three additional eligible activities: conservation of existing forest carbon stocks, sustainable management of forests, and enhancement of forest carbon stocks. It is the UNFCCC framework that emerged from successive COP decisions starting in Bali (2007) and consolidated under the Warsaw Framework (2013).\n\nIn the voluntary market REDD+ is operationalised through methodologies like VM0007 (legacy) and VM0048 (consolidated successor). In Indonesia, REDD+ projects most commonly target peat-swamp forest in Kalimantan and Sumatra, where avoided emissions per hectare are exceptionally high because of the deep organic carbon stored in the underlying peat dome.',
    category: 'market',
    relatedTerms: ['vm0007', 'vm0048'],
  },
  {
    slug: 'arr',
    term: 'ARR',
    aliases: ['Afforestation, Reforestation and Revegetation'],
    short:
      'A removal-credit activity class that plants or regrows vegetation, distinct from REDD+ avoidance; consolidated under VCS methodology VM0047.',
    long:
      'ARR — Afforestation, Reforestation and Revegetation — is the activity class that creates new vegetation cover or restores degraded land to credit the carbon sequestered as biomass and soil carbon accumulate. Unlike REDD+, which credits avoided emissions from forests that would otherwise have been cleared, ARR credits carbon removals: net new sequestration above a baseline.\n\nIn the voluntary market ARR is consolidated under Verra methodology VM0047 (active May 2025), which superseded the CDM-derived AR-ACM0003 large-scale and AR-AMS0007 small-scale methodologies. ARR projects in Indonesia range from smallholder agroforestry on degraded mineral soils through to large-scale plantation reforestation; mangrove ARR sits under the related blue-carbon methodology VM0033.',
    category: 'market',
    relatedTerms: ['vm0047', 'vm0033', 'redd-plus'],
  },
  {
    slug: 'ccb',
    term: 'CCB / CCBS',
    aliases: ['Climate, Community & Biodiversity Standards'],
    short:
      'Co-benefit overlay certification on VCS projects; Gold-level designations indicate exceptional climate, community, or biodiversity performance.',
    long:
      'The Climate, Community & Biodiversity Standards (CCB Standards, frequently CCBS) are an overlay certification originally developed by the Climate, Community & Biodiversity Alliance and now stewarded by Verra. CCB does not by itself issue carbon credits — it is layered on top of a host carbon standard such as the VCS — and certifies that the project delivers credible co-benefits beyond emissions reductions.\n\nProjects can additionally earn Gold-level designations: Climate Gold, Community Gold, or Biodiversity Gold, awarded for exceptional performance in each domain. Projects achieving Gold in multiple domains are colloquially described as Double Gold or Triple Gold and are sought after by buyers prioritising co-benefit narratives. CCB certification is common among Indonesian peatland REDD+ projects.',
    category: 'market',
  },

  // ── Indonesian registry / regulation ─────────────────────────────────────
  {
    slug: 'srn-ppi',
    term: 'SRN-PPI',
    aliases: ['Sistem Registri Nasional Pengendalian Perubahan Iklim'],
    short:
      "Indonesia's national climate-change control registry, maintained by KLHK; post-October 2025 Verra MRA, Indonesian VCS projects dual-register on SRN-PPI.",
    long:
      "SRN-PPI — Sistem Registri Nasional Pengendalian Perubahan Iklim, the National Registry System for Climate Change Control — is Indonesia's official government registry for climate mitigation actions, NDC accounting, and (since the 2021–2022 carbon-pricing reforms) carbon-market activity. It is maintained by the Ministry of Environment and Forestry (Kementerian Lingkungan Hidup dan Kehutanan, KLHK).\n\nSince the October 2025 Mutual Recognition Arrangement (MRA) between Verra and the Government of Indonesia, Indonesian projects on the VCS programme are required to dual-register on SRN-PPI so the same emission reduction is consistently tracked against the national NDC. SRN-PPI is also the issuing system for SPE-GRK domestic certificates and the upstream record for IDXCarbon trading.",
    category: 'registry',
    relatedTerms: ['spe-grk', 'idxcarbon', 'permenhut'],
  },
  {
    slug: 'spe-grk',
    term: 'SPE-GRK',
    aliases: ['Sertifikat Pengurangan Emisi Gas Rumah Kaca'],
    short:
      "Indonesia's domestic GHG emission-reduction certificate, issued via SRN-PPI and traded on the IDXCarbon spot market.",
    long:
      "SPE-GRK — Sertifikat Pengurangan Emisi Gas Rumah Kaca, literally 'Greenhouse Gas Emission Reduction Certificate' — is Indonesia's domestic carbon-credit unit. Each SPE-GRK represents one tonne of CO2-equivalent emission reduction or removal, validated and verified under the SRN-PPI process.\n\nSPE-GRK units are the tradable instrument on the IDXCarbon spot market launched by the Indonesia Stock Exchange in September 2023, and they are also the unit recognised for compliance against the cap-and-trade obligations imposed on Indonesian power-sector emitters. Some SPE-GRK supply originates from voluntary-market projects whose issuances are mirrored from VCS or other international standards into the SRN-PPI registry under the Verra MRA arrangement.",
    category: 'registry',
    relatedTerms: ['srn-ppi', 'idxcarbon'],
  },
  {
    slug: 'idxcarbon',
    term: 'IDXCarbon',
    aliases: ['Bursa Karbon Indonesia'],
    short:
      "The Indonesia Stock Exchange's carbon spot market, launched September 2023, trading SPE-GRK units issued through SRN-PPI.",
    long:
      'IDXCarbon — branded Bursa Karbon Indonesia — is the carbon spot exchange operated by the Indonesia Stock Exchange (PT Bursa Efek Indonesia, IDX). It launched on 26 September 2023 as the official venue for trading Indonesian carbon units, mandated by the carbon-economic-value (Nilai Ekonomi Karbon, NEK) reforms set out in Perpres 98/2021 and operationalised by OJK regulations.\n\nThe primary instrument traded on IDXCarbon is the SPE-GRK unit issued through SRN-PPI. Trading mechanisms include auction, regular spot market, negotiated trades, and a marketplace board. Initial liquidity has been thin and dominated by power-sector compliance buyers; subsequent regulatory packages — including Perpres 110/2025 opening international trading — are aimed at deepening the order book.',
    category: 'market',
    relatedTerms: ['spe-grk', 'srn-ppi', 'perpres'],
  },
  {
    slug: 'permenhut',
    term: 'Permenhut',
    aliases: ['Peraturan Menteri Kehutanan', 'Peraturan Menteri Lingkungan Hidup dan Kehutanan'],
    short:
      "An Indonesian Ministry of Forestry regulation; Permenhut 6/2026 is the current implementing regulation for forest-sector carbon trading.",
    long:
      'Permenhut is the standard abbreviation for Peraturan Menteri Kehutanan — a regulation issued by the Indonesian Minister of Forestry (currently within Kementerian Kehutanan, with related instruments also issued by the Ministry of Environment, Kementerian Lingkungan Hidup). It sits below presidential regulations (Perpres) and government regulations (PP) in the Indonesian legal hierarchy but has direct operational force for the sector it covers.\n\nIn the carbon context, successive Permenhut have set the implementing rules for forestry-sector carbon trading, project licensing, benefit-sharing arrangements with adat (customary) communities, and verification requirements. Permenhut 6/2026 is the current implementing regulation governing forest-sector carbon trading and is the operational reference point for new VCS and SRN-PPI forestry projects.',
    category: 'regulation',
    relatedTerms: ['perpres', 'srn-ppi'],
  },
  {
    slug: 'perpres',
    term: 'Perpres',
    aliases: ['Peraturan Presiden'],
    short:
      "An Indonesian presidential regulation; Perpres 98/2021 set the carbon-pricing baseline and Perpres 110/2025 opens international carbon trading.",
    long:
      "Perpres — Peraturan Presiden, presidential regulation — is a legal instrument issued directly by the President of the Republic of Indonesia, sitting below laws (Undang-Undang) and government regulations (Peraturan Pemerintah) but above ministerial regulations in the legal hierarchy. Perpres are the typical vehicle for setting cross-ministerial policy frameworks where a single ministry's authority is insufficient.\n\nFor the carbon market, Perpres 98/2021 (Penyelenggaraan Nilai Ekonomi Karbon, the 'carbon-economic-value' regulation) established the legal baseline for carbon pricing in Indonesia — defining cap-and-trade, carbon offsets, and result-based-payment mechanisms. Perpres 110/2025 subsequently opened the framework to international trading and authorised Article 6 cooperative approaches with foreign jurisdictions.",
    category: 'regulation',
    relatedTerms: ['permenhut', 'idxcarbon', 'srn-ppi'],
  },
  {
    slug: 'bpdlh',
    term: 'BPDLH',
    aliases: ['Badan Pengelola Dana Lingkungan Hidup', 'Indonesia Environment Fund'],
    short:
      "Indonesia's Environment Fund Management Agency, channelling climate finance and result-based payments tied to Indonesian carbon and forest projects.",
    long:
      "BPDLH — Badan Pengelola Dana Lingkungan Hidup, the Environment Fund Management Agency — is the Indonesian public-service body (Badan Layanan Umum) under the Ministry of Finance that pools and disburses climate, forestry, and environmental funds. It was established in 2019 to centralise the management of result-based payments and donor-funded climate finance flowing into Indonesia.\n\nIn the carbon context, BPDLH receives result-based payments tied to Indonesia's REDD+ performance (notably from Norway under the Letter of Intent successor agreements and from the Green Climate Fund), administers benefit-sharing distributions to subnational governments and communities, and is increasingly involved in channelling proceeds from domestic carbon-pricing instruments back into mitigation and adaptation programmes.",
    category: 'regulation',
    relatedTerms: ['srn-ppi', 'redd-plus'],
  },
];

/**
 * Look up a term by URL slug. Returns null when no entry matches —
 * the page-level handler should call `notFound()` on null.
 */
export function getTermBySlug(slug: string): GlossaryTerm | null {
  const hit = GLOSSARY.find((t) => t.slug === slug);
  return hit ?? null;
}

/**
 * Return the full glossary, sorted alphabetically by `term` and then
 * by `category` as a stable tiebreaker. Pages should render from this
 * (rather than `GLOSSARY` directly) so ordering stays consistent across
 * the index and any cross-links.
 */
export function listTerms(): GlossaryTerm[] {
  return [...GLOSSARY].sort((a, b) => {
    const t = a.term.localeCompare(b.term, 'en', { sensitivity: 'base' });
    if (t !== 0) return t;
    return a.category.localeCompare(b.category);
  });
}
