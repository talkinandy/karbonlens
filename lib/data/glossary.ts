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

  // ── Phase 2B expansion: Indonesian agencies + instruments ─────────────────
  {
    slug: 'klhk',
    term: 'KLHK',
    aliases: ['Kementerian Lingkungan Hidup dan Kehutanan', 'Ministry of Environment and Forestry'],
    short:
      "Indonesia's Ministry of Environment and Forestry, the line ministry that issues forestry concessions and carbon-trading permits for forestry-based projects.",
    long:
      "KLHK — Kementerian Lingkungan Hidup dan Kehutanan, the Ministry of Environment and Forestry — is the Indonesian line ministry with the broadest direct authority over forest-based carbon projects. KLHK issues the underlying concessions (PBPH, IUPHHK, restoration concessions) that anchor REDD+ and ARR projects, and it is the principal author of Permenhut regulations governing how those concessions can monetise carbon. The 2024 ministry split separating Forestry (Kemenhut) from Environment (KLH) is in progress but, at the time of writing, KLHK is still the consolidated ministry referenced in Permenhut 14/2024 and Permenhut 6/2026.\n\nFor any forestry-based Indonesian carbon project, KLHK is the gating regulator: it must register the project in the SRN, authorise any export of credits abroad (Surat Persetujuan), and supervise the underlying land tenure that gives the project its standing.",
    category: 'regulation',
    relatedTerms: ['permenhut', 'srn-ppi', 'redd-plus'],
    authoritySource: {
      url: 'https://www.menlhk.go.id/',
      title: 'KLHK — official site',
    },
  },
  {
    slug: 'ojk',
    term: 'OJK',
    aliases: ['Otoritas Jasa Keuangan', 'Financial Services Authority'],
    short:
      "Indonesia's Financial Services Authority, the regulator of IDXCarbon and the issuer of POJK 14/2023 which set the carbon-exchange operating rules.",
    long:
      "OJK — Otoritas Jasa Keuangan, the Financial Services Authority — is Indonesia's integrated regulator for banking, capital markets, and non-bank financial institutions, modelled on a single-regulator framework. In the carbon context, OJK is the body that licensed and supervises IDXCarbon (the Indonesia Carbon Exchange) and that issued POJK 14/2023 — the operational regulation that defined what may be traded, who may trade, and what disclosures are required.\n\nOJK is the financial-sector counterpart to KLHK in the carbon regulatory stack: KLHK governs the underlying credits and forestry rights, while OJK governs the marketplace and the financial-product status of those credits. Decisions on listing, custody, settlement, and market conduct on IDXCarbon flow from OJK rather than the Ministry of Trade or the Ministry of Finance.",
    category: 'regulation',
    relatedTerms: ['idxcarbon', 'pojk', 'kemenkeu'],
    authoritySource: {
      url: 'https://www.ojk.go.id/',
      title: 'OJK — official site',
    },
  },
  {
    slug: 'kemenkeu',
    term: 'Kemenkeu',
    aliases: ['Kementerian Keuangan', 'Ministry of Finance'],
    short:
      "Indonesia's Ministry of Finance — sets the carbon tax (introduced under HPP Law 7/2021) and oversees BPDLH, the public body that channels climate finance.",
    long:
      "Kemenkeu — Kementerian Keuangan, the Ministry of Finance — owns the fiscal levers of Indonesia's climate policy. The 2021 HPP Law (Undang-Undang Harmonisasi Peraturan Perpajakan) introduced a Rp 30/kgCO₂e carbon tax that Kemenkeu administers (its implementation has been deferred multiple times). Kemenkeu also supervises BPDLH, the Environment Fund Management Agency, and through BPDLH controls the disbursement of REDD+ result-based payments and other climate finance flows.\n\nKemenkeu's role differs from KLHK and OJK: it is the budget and tax authority, not a sectoral regulator of either forestry or financial markets. But it sits behind any cross-ministerial carbon-pricing framework — Perpres 98/2021 and Perpres 110/2025 both require Kemenkeu approval for fiscal measures, and BPDLH cannot disburse without Kemenkeu authorisation.",
    category: 'regulation',
    relatedTerms: ['bpdlh', 'perpres'],
    authoritySource: {
      url: 'https://www.kemenkeu.go.id/',
      title: 'Kemenkeu — official site',
    },
  },
  {
    slug: 'bappenas',
    term: 'BAPPENAS',
    aliases: ['Badan Perencanaan Pembangunan Nasional', 'National Development Planning Agency'],
    short:
      "Indonesia's national development planning agency, custodian of the long-term low-carbon development plan (LCDI) and the operationalisation of the NDC.",
    long:
      "BAPPENAS — Badan Perencanaan Pembangunan Nasional, the National Development Planning Agency — is the central planning body that maintains the five-year RPJMN development plan and the longer-horizon Low Carbon Development Indonesia (LCDI) initiative. Where KLHK operationalises forest-sector policy and Kemenkeu owns the budget, BAPPENAS owns the framework that ties climate targets back to economic planning.\n\nFor the carbon market, BAPPENAS is most visible as the convening agency behind Indonesia's NDC submissions to the UNFCCC and the supporting analytical work (the Long Term Strategy on Low Carbon and Climate Resilience). Its role in any specific carbon project is indirect — projects go through KLHK and OJK — but the targets that drive Indonesia's compliance carbon market design originate in BAPPENAS plans.",
    category: 'regulation',
    relatedTerms: ['ndc', 'klhk'],
    authoritySource: {
      url: 'https://www.bappenas.go.id/',
      title: 'BAPPENAS — official site',
    },
  },
  {
    slug: 'uu',
    term: 'UU',
    aliases: ['Undang-Undang', 'law', 'statute'],
    short:
      "An Indonesian law, the highest tier of national legislation, passed by the House of Representatives (DPR) and signed by the President.",
    long:
      "UU — Undang-Undang — is the standard abbreviation for an Indonesian law: a piece of national legislation passed by the People's Representative Council (DPR-RI) and signed into force by the President. In the legal hierarchy laid out by UU 12/2011, UU sits above Government Regulations (PP), Presidential Regulations (Perpres), and ministerial regulations (Permen).\n\nFor carbon, the most directly relevant UU is UU 7/2021 (Harmonisasi Peraturan Perpajakan, the 2021 tax-harmonisation law) which introduced Indonesia's domestic carbon tax. UU 16/2016 ratified the Paris Agreement, giving Indonesia's NDC its domestic legal anchor. UU 32/2009 (Environmental Protection and Management) provides the umbrella authority under which most KLHK regulations operate.",
    category: 'regulation',
    relatedTerms: ['pp', 'perpres', 'permenhut', 'ndc'],
  },
  {
    slug: 'pp',
    term: 'PP',
    aliases: ['Peraturan Pemerintah', 'government regulation'],
    short:
      "An Indonesian Government Regulation, issued by the President to operationalise a law; sits between UU and Perpres in the legal hierarchy.",
    long:
      "PP — Peraturan Pemerintah, a Government Regulation — is the implementation-level legal instrument the President issues to operationalise a specific law (UU). Unlike Perpres, which the President can issue at their own initiative for cross-ministerial policy, a PP is always grounded in delegated authority from a specific UU and is typically drafted by the line ministry charged with implementation.\n\nIn carbon policy, PP 46/2017 (on Environmental Economic Instruments) was an early enabling instrument later superseded for carbon-specific work by Perpres 98/2021. PPs covering forestry concessions (PP 23/2021 on forest management) sit below the umbrella UU 41/1999 (Forestry) and shape what activities a concession holder can run on the land that anchors a forestry carbon project.",
    category: 'regulation',
    relatedTerms: ['uu', 'perpres'],
  },
  {
    slug: 'pojk',
    term: 'POJK',
    aliases: ['Peraturan OJK', 'OJK regulation'],
    short:
      "A regulation issued by Indonesia's Financial Services Authority (OJK); POJK 14/2023 set the operating rules for the IDXCarbon carbon exchange.",
    long:
      "POJK — Peraturan Otoritas Jasa Keuangan — is a regulation issued by Indonesia's Financial Services Authority (OJK), the integrated regulator of banking, capital markets, and non-bank finance. POJKs sit below ministerial regulations in the legal hierarchy but, within OJK's jurisdiction, are the binding operational rules.\n\nFor the carbon market the most consequential POJK is POJK 14/2023, the regulation on the organisation of carbon-unit trading on Bursa Karbon. POJK 14/2023 defines who can be a trading participant (registered exchange members), what units may be traded (SPE-GRK and tradeable carbon units registered in SRN-PPI), what disclosures issuers must make, and how clearing and settlement work. Every IDXCarbon trade and listing reference this regulation as its legal basis.",
    category: 'regulation',
    relatedTerms: ['ojk', 'idxcarbon', 'spe-grk'],
  },

  // ── Carbon market core acronyms ───────────────────────────────────────────
  {
    slug: 'nek',
    term: 'NEK',
    aliases: ['Nilai Ekonomi Karbon', 'carbon economic value'],
    short:
      "Indonesia's official term for 'carbon economic value' — the umbrella framework introduced by Perpres 98/2021 that covers pricing, trading, taxes, and result-based payments.",
    long:
      "NEK — Nilai Ekonomi Karbon, literally 'carbon economic value' — is the term used in Indonesian regulation to refer to the entire policy framework for monetising carbon emissions and removals. It is the umbrella concept that subsumes four specific mechanisms: cap-and-trade (perdagangan emisi karbon), carbon offsets (offset emisi karbon), result-based payments (pembayaran berbasis kinerja), and the carbon tax (pajak karbon).\n\nPerpres 98/2021 is the founding NEK regulation. It established the legal scope of each of the four mechanisms and assigned coordinating responsibility to KLHK with supporting roles for OJK (financial markets), Kemenkeu (taxation and result-based payments via BPDLH), and BAPPENAS (planning). Perpres 110/2025 extended the NEK framework to authorise international cooperation under Article 6 of the Paris Agreement.",
    category: 'regulation',
    relatedTerms: ['perpres', 'spe-grk', 'idxcarbon', 'klhk'],
  },
  {
    slug: 'ndc',
    term: 'NDC',
    aliases: ['Nationally Determined Contribution', 'Kontribusi yang Ditetapkan secara Nasional'],
    short:
      "A country's pledged emissions-reduction target under the Paris Agreement; Indonesia's current NDC targets 31.89% reduction unconditional, 43.20% with international support, by 2030.",
    long:
      "NDC — Nationally Determined Contribution — is the climate target each Paris Agreement signatory submits to the UNFCCC, updated every five years on a ratcheting basis. The NDC sets out the country's emissions-reduction commitments, the sectors covered, and the baseline against which reductions are measured.\n\nIndonesia's Enhanced NDC (submitted 2022) targets a 31.89 % reduction in greenhouse-gas emissions by 2030 against a business-as-usual baseline (unconditional, using domestic resources) and 43.20 % with international support. The forest and land-use sector (FOLU) accounts for the largest share of the target, and Indonesia has set out a separate 'FOLU Net Sink 2030' strategy under which the sector becomes net-negative by 2030. NDC achievement underpins Indonesia's eligibility for Article 6 cooperative-approach revenue and frames the domestic carbon-tax design.",
    category: 'market',
    relatedTerms: ['article-6', 'nek', 'klhk', 'bappenas'],
    authoritySource: {
      url: 'https://unfccc.int/NDCREG',
      title: 'UNFCCC NDC Registry',
    },
  },
  {
    slug: 'mrv',
    term: 'MRV',
    aliases: ['Measurement Reporting and Verification', 'Monitoring Reporting Verification'],
    short:
      "Measurement, Reporting and Verification — the discipline of quantifying, documenting, and independently checking emissions reductions or removals claimed by a carbon project.",
    long:
      "MRV — Measurement, Reporting and Verification — is the foundational discipline that makes carbon credits a tradeable commodity rather than an assertion. Measurement covers the in-field and remote-sensing techniques used to estimate emissions reductions or removals; reporting is the structured documentation submitted to a registry; verification is the independent third-party audit (a VVB — Validation and Verification Body) that confirms the report.\n\nFor forestry projects, MRV typically combines plot-level biomass measurements with satellite imagery (RADD alerts, GLAD, Sentinel) to monitor forest cover, plus modelled baseline projections. Modern Indonesian-relevant methodologies (VM0048, VM0033, VM0047) prescribe specific MRV protocols. ICVCM's Core Carbon Principles set 'robust quantification' criteria that effectively raise the MRV bar for methodologies seeking CCP-eligible status.",
    category: 'market',
    relatedTerms: ['icvcm', 'vm0048', 'gfw'],
  },
  {
    slug: 'vcm',
    term: 'VCM',
    aliases: ['Voluntary Carbon Market'],
    short:
      "The market in which buyers — usually corporates with voluntary net-zero pledges — purchase carbon credits without a regulatory obligation to do so.",
    long:
      "The Voluntary Carbon Market (VCM) is the set of trading venues, intermediaries, registries, and standards through which carbon credits flow when the buyer is acting voluntarily — typically a corporate offsetting its operational emissions to meet a net-zero target, rather than a regulated emitter fulfilling a legal cap.\n\nThe VCM and the Compliance Carbon Market (CCM) draw from overlapping methodologies but with very different governance: VCM is governed by private standards-setters (Verra/VCS, Gold Standard, ACR, CAR, plus the integrity bodies ICVCM and VCMI) rather than by a regulator. Indonesian Verra/Gold-Standard projects are VCM credits. The same project may also list its credits in SRN-PPI and trade them on IDXCarbon (which today is hybrid — primarily VCM-style but operating under OJK regulation).",
    category: 'market',
    relatedTerms: ['ccm', 'vcs', 'icvcm', 'idxcarbon'],
  },
  {
    slug: 'ccm',
    term: 'CCM',
    aliases: ['Compliance Carbon Market'],
    short:
      "A carbon market in which regulated emitters are legally required to surrender allowances or eligible offsets to cover their emissions.",
    long:
      "A Compliance Carbon Market (CCM) is one in which a regulator imposes a legal cap or obligation on covered emitters, forcing them to surrender allowances or eligible offset credits each compliance period. The EU ETS, UK ETS, California Cap-and-Trade, RGGI, China's national ETS, and South Korea's K-ETS are the largest established compliance markets. The price floor in a CCM is set by the cap stringency and the marginal abatement cost faced by covered emitters.\n\nIndonesia's domestic carbon market is in transition toward a hybrid model: IDXCarbon currently lists both voluntary-style credits (registered through SRN-PPI) and compliance-eligible units (SPE-GRK), with the cap-and-trade phase covering coal-fired power plants under Permendag and KLHK rules. International cooperation under Article 6 — opened by Perpres 110/2025 — also creates demand for Indonesian credits from foreign compliance markets.",
    category: 'market',
    relatedTerms: ['vcm', 'idxcarbon', 'article-6', 'spe-grk'],
  },
  {
    slug: 'vcs',
    term: 'VCS',
    aliases: ['Verified Carbon Standard'],
    short:
      "The carbon-credit standard owned by Verra — the most widely used voluntary-market standard globally, including the bulk of Indonesian project credits.",
    long:
      "VCS — the Verified Carbon Standard — is the certification standard owned and operated by Verra, the largest voluntary-market crediting programme by issued volume. A VCS project goes through a full lifecycle: it is registered, validated against an approved methodology (the VM####, VMR####, and AMS-#### families), undergoes verification at intervals, and is issued Verified Carbon Units (VCUs) for each tonne of CO₂e it has reduced or removed.\n\nIndonesian projects on Verra typically use VM0007 (legacy REDD+), VM0048 (consolidated REDD), VM0033 (tidal wetland restoration), or VM0047 (ARR). VCS credits can be 'stacked' with co-benefit standards like CCB (Climate, Community & Biodiversity). VCS-certified credits dominate the Indonesian voluntary supply and increasingly route through IDXCarbon once cross-registered into SRN-PPI.",
    category: 'registry',
    relatedTerms: ['vm0007', 'vm0048', 'vcu', 'ccb', 'icvcm'],
    authoritySource: {
      url: 'https://verra.org/programs/verified-carbon-standard/',
      title: 'VCS — Verra',
    },
  },
  {
    slug: 'vcu',
    term: 'VCU',
    aliases: ['Verified Carbon Unit'],
    short:
      "The fungible carbon credit issued under Verra's VCS programme — one VCU equals one tonne of CO₂e reduced, avoided, or removed.",
    long:
      "A Verified Carbon Unit (VCU) is the credit instrument issued under Verra's Verified Carbon Standard programme. One VCU represents the reduction or removal of one tonne of CO₂-equivalent, verified by an accredited third-party auditor against an approved methodology. VCUs are recorded in the Verra registry under a unique serial number and a vintage (the year of emissions reduction).\n\nVCUs are the most-traded voluntary-market unit globally and the dominant unit type for Indonesian forestry credits issued on Verra. They can be retired (permanently used to offset a tonne of emissions) or transferred between accounts; once retired, the serial number is publicly logged in the Verra registry. Cross-registration into SRN-PPI for IDXCarbon trading converts the unit into an SPE-GRK while leaving the underlying VCU retired in Verra.",
    category: 'registry',
    relatedTerms: ['vcs', 'spe-grk', 'srn-ppi'],
  },
  {
    slug: 'itmo',
    term: 'ITMO',
    aliases: ['Internationally Transferred Mitigation Outcome'],
    short:
      "A Paris Agreement Article 6.2 unit — one tonne CO₂e of emission reduction transferred between countries with corresponding adjustments to both NDCs.",
    long:
      "ITMO — Internationally Transferred Mitigation Outcome — is the unit of trade under Article 6.2 of the Paris Agreement, the bilateral cooperation track. When a host country (e.g. Indonesia) authorises the transfer of a mitigation outcome to a buyer country (e.g. Singapore or Japan), the host commits to a corresponding adjustment: adding the transferred tonnes back to its own reported emissions so the credit cannot be counted twice toward both NDCs.\n\nIndonesia's domestic legal anchor for ITMO transfers is Perpres 110/2025, which explicitly opened the NEK framework to international cooperative approaches. Indonesia signed Implementation Agreements with Singapore, Japan, Switzerland, and several others, with KLHK-issued Surat Otorisasi (letters of authorisation) and corresponding-adjustment recording the gating steps. Article 6.4 ITMOs — under the centralised PACM mechanism — are a separate track.",
    category: 'market',
    relatedTerms: ['article-6', 'ndc', 'perpres'],
  },
  {
    slug: 'article-6',
    term: 'Article 6',
    aliases: ['Article 6 of the Paris Agreement'],
    short:
      "The Paris Agreement provisions (6.2, 6.4, 6.8) for international cooperation on mitigation, enabling cross-border carbon-credit transfers between NDCs.",
    long:
      "Article 6 of the Paris Agreement defines three mechanisms by which countries can cooperate to meet their NDCs. Article 6.2 covers bilateral cooperative approaches between two or more countries — these generate ITMOs and require corresponding adjustments to prevent double-counting. Article 6.4 establishes a centralised UN mechanism (PACM, the Paris Agreement Crediting Mechanism), the successor to the CDM. Article 6.8 covers non-market approaches (capacity building, technology transfer).\n\nFor Indonesia, Article 6 is the legal hook for any export of carbon credits abroad. Perpres 110/2025 opened the domestic framework to Article 6 cooperation, KLHK issues the Surat Otorisasi authorisations, and BPDLH increasingly handles the financial flows. The Article 6.2 / 6.4 distinction matters because 6.4 PACM-issued credits go through a UN-administered registry while 6.2 transfers remain bilateral and rely on host-country registries (SRN-PPI for Indonesia).",
    category: 'market',
    relatedTerms: ['itmo', 'cdm', 'perpres', 'ndc'],
    authoritySource: {
      url: 'https://unfccc.int/topics/article-6',
      title: 'UNFCCC — Article 6',
    },
  },
  {
    slug: 'icvcm',
    term: 'ICVCM',
    aliases: ['Integrity Council for the Voluntary Carbon Market', 'Core Carbon Principles'],
    short:
      "The integrity body that assesses voluntary-market methodologies against its Core Carbon Principles (CCPs) and labels CCP-eligible categories.",
    long:
      "ICVCM — the Integrity Council for the Voluntary Carbon Market — is an independent governance body launched in 2022 to set quality benchmarks for voluntary-market credits. Its flagship product is the Core Carbon Principles (CCPs): ten high-level principles spanning governance, robust quantification, additionality, permanence, no double counting, and sustainable development. ICVCM assesses individual methodologies category-by-category and either grants or denies CCP-eligible status.\n\nFor Indonesian projects the most consequential ICVCM decisions to date are: (i) VM0048 received CCP-eligible status for several activity modules; (ii) several legacy VM0007 sub-modules (notably some Avoided Unplanned Deforestation variants) did not receive CCP eligibility, contributing to Verra's push toward VM0048 transition. CCP-eligible credits typically command a price premium and are favoured by integrity-conscious corporate buyers.",
    category: 'market',
    relatedTerms: ['vm0048', 'vm0007', 'vcs', 'vcm'],
    authoritySource: {
      url: 'https://icvcm.org/core-carbon-principles/',
      title: 'ICVCM Core Carbon Principles',
    },
  },
  {
    slug: 'srn',
    term: 'SRN',
    aliases: ['Sistem Registri Nasional'],
    short:
      "Indonesia's National Registry System for climate action — the umbrella registry of which SRN-PPI is the carbon-trading slice operated by KLHK.",
    long:
      "SRN — Sistem Registri Nasional — is Indonesia's umbrella National Registry System for recording climate-related actions, including mitigation projects, adaptation actions, and climate finance flows. SRN was established under Permen LHK 71/2017 as the data backbone the country uses to track delivery against its NDC.\n\nSRN-PPI (Pengendalian Perubahan Iklim, Climate Change Control) is the most prominent slice of SRN — it is the carbon-trading-relevant subset that holds project records and unit issuances for credits intended for IDXCarbon trading or international transfer. The broader SRN system also captures non-carbon climate actions (adaptation projects, climate-finance grants). KLHK operates both, with the SRN-PPI portal at apeksi.menlhk.go.id and the broader SRN portal at srn.menlhk.go.id.",
    category: 'registry',
    relatedTerms: ['srn-ppi', 'klhk', 'idxcarbon'],
  },

  // ── Methodologies present in the registry that previously had no entry ────
  {
    slug: 'vm0009',
    term: 'VM0009',
    aliases: ['Methodology for Avoided Ecosystem Conversion'],
    short:
      "Verra methodology for Avoided Ecosystem Conversion — credits projects that prevent the conversion of any natural ecosystem to non-forest land use.",
    long:
      "VM0009 is Verra's methodology for Avoided Ecosystem Conversion (AEC) — broader in scope than the forest-only REDD methodologies because it covers grasslands, peatlands, mangroves, and other natural ecosystems threatened by conversion to agriculture or development. Projects must establish a deforestation/conversion baseline using historical and remote-sensing evidence and demonstrate the avoided conversion is both additional and quantifiable.\n\nVM0009 has been used for Indonesian peat-forest and tidal-wetland projects where the activity is broader than canonical REDD — e.g. mangrove conservation areas threatened by aquaculture conversion. As of 2023-2024 Verra has been steering peat-rewetting projects toward VM0033 and grassland projects toward VM0048's broader activity modules, so VM0009 issuances are concentrated in projects already in their crediting period rather than new registrations.",
    category: 'methodology',
    relatedTerms: ['vm0007', 'vm0033', 'vm0048'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0009-methodology-for-avoided-ecosystem-conversion-v3-0/',
      title: 'VM0009 v3.0 — Verra',
    },
  },
  {
    slug: 'vm0011',
    term: 'VM0011',
    aliases: ['Methodology for Calculating GHG Benefits from Preventing Planned Degradation'],
    short:
      "Verra methodology (legacy) for crediting projects that prevent the planned degradation of forests — superseded by VM0048's planned-degradation module.",
    long:
      "VM0011 is a legacy Verra methodology for crediting projects that prevent planned forest degradation (e.g. preventing a logging concession from being exercised). It was rarely used compared to its REDD siblings because the eligibility criteria for 'planned degradation' are narrow: the baseline must rest on a documented, legally authorised plan to degrade the forest that the project displaces.\n\nWith the publication of VM0048 in 2023 — the consolidated REDD methodology — Verra is steering new registrations away from VM0011 and toward VM0048's planned-degradation module (forthcoming as part of the VM0048 family). VM0011 issuances are now concentrated in a small set of projects already in their original crediting period; new registrations should expect to use the VM0048 framework instead.",
    category: 'methodology',
    relatedTerms: ['vm0048', 'vm0007'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0011-methodology-for-calculating-ghg-benefits-from-preventing-planned-degradation-v1-0/',
      title: 'VM0011 v1.0 — Verra',
    },
  },
  {
    slug: 'vm0042',
    term: 'VM0042',
    aliases: ['Improved Agricultural Land Management', 'IALM'],
    short:
      "Verra methodology for Improved Agricultural Land Management — credits practices like cover cropping, reduced tillage, and nutrient management that increase soil-carbon stocks.",
    long:
      "VM0042 is Verra's methodology for Improved Agricultural Land Management (IALM), launched in 2020. It covers a wide set of soil-carbon and agronomic practices: cover cropping, reduced or no-till, nutrient-management optimisation, crop-rotation diversification, biochar application, and conversion of cropland to perennial cover. Baselines are typically established through region-specific reference-management systems plus on-farm sampling.\n\nVM0042 is increasingly relevant to the Indonesian palm-oil and rice-paddy sectors, where soil-carbon and methane reductions are both eligible. Methane reductions from rice paddies are large in tonnage terms but require strict measurement protocols, often combining tier-3 models with chamber measurements. As of 2024, the bulk of VM0042 projects globally are in the US, Latin America, and Australia; Indonesian adoption has lagged but interest is rising as ICVCM CCP eligibility lifts demand.",
    category: 'methodology',
    relatedTerms: ['arr', 'vm0048'],
    authoritySource: {
      url: 'https://verra.org/methodologies/vm0042-methodology-for-improved-agricultural-land-management-v2-0/',
      title: 'VM0042 v2.0 — Verra',
    },
  },
  {
    slug: 'ar-ams0007',
    term: 'AR-AMS0007',
    aliases: ['Small-scale Afforestation and Reforestation on Grasslands or Croplands'],
    short:
      "CDM small-scale methodology for Afforestation and Reforestation on grasslands or croplands — covers projects under 16,000 tCO₂e/year of removals.",
    long:
      "AR-AMS0007 is a CDM (Clean Development Mechanism) small-scale methodology for Afforestation and Reforestation projects on land that was grassland or cropland at project start. Small-scale CDM methodologies have a removal cap (in this case 16,000 tCO₂e/year) but lower transaction costs than full-scale methodologies, making them suitable for community-led or smallholder-scale tree-planting.\n\nA handful of Indonesian smallholder ARR projects are registered under AR-AMS0007, typically with co-benefit standards (CCB) layered on top. With the Article 6.4 PACM mechanism succeeding the CDM, AR-AMS0007 projects face a transition decision: stay under the legacy CDM (which can no longer issue new credits after the 2024 cutoff), or re-register under PACM or under Verra's VM0047. Most Indonesian registrants are exploring VM0047 as the migration path.",
    category: 'methodology',
    relatedTerms: ['arr', 'vm0047', 'cdm', 'article-6'],
    authoritySource: {
      url: 'https://cdm.unfccc.int/methodologies/ARmethodologies/approved.html',
      title: 'CDM A/R Approved Methodologies',
    },
  },
  {
    slug: 'ams-i-d',
    term: 'AMS-I.D.',
    aliases: ['Grid connected renewable electricity generation', 'AMS I D'],
    short:
      "CDM small-scale methodology for grid-connected renewable-electricity generation — covers utility-scale solar/wind/hydro up to the 15 MW small-scale cap.",
    long:
      "AMS-I.D. is a CDM small-scale methodology for grid-connected renewable electricity, accepting hydroelectric, wind, solar, biomass, and geothermal projects up to 15 MW (the small-scale CDM threshold). The methodology calculates emissions reductions by displacing fossil generation on the connected grid; the displacement factor is the country-specific or regional grid emission factor.\n\nIn Indonesia, AMS-I.D. has been used in particular for small-scale hydro and biomass plants connected to PLN's regional grids. It is often combined with AMS-III.H. (landfill gas / methane recovery) or with biomass-specific methodologies. With the CDM closing to new registrations post-2024, projects are migrating to Verra's VCS framework (VM-class methodologies) or to PACM under Article 6.4. Existing AMS-I.D. issuances continue to trade on the secondary CER market.",
    category: 'methodology',
    relatedTerms: ['ams-iii-h', 'cdm', 'article-6'],
    authoritySource: {
      url: 'https://cdm.unfccc.int/methodologies/SSCmethodologies/approved.html',
      title: 'CDM SSC Approved Methodologies',
    },
  },
  {
    slug: 'acm0001',
    term: 'ACM0001',
    aliases: ['Flaring or use of landfill gas'],
    short:
      "CDM consolidated large-scale methodology for landfill-gas capture, flaring, or productive use — covers methane recovery from municipal solid-waste landfills.",
    long:
      "ACM0001 is a CDM consolidated methodology for the capture, flaring, or productive use of landfill gas — the methane-rich biogas generated by anaerobic decomposition in municipal solid-waste (MSW) landfills. Eligible activities include venting through a flare (methane to CO₂), electricity generation from gas engines, or pipeline injection. Baseline assumes the methane would otherwise vent uncontrolled.\n\nIn Indonesia, ACM0001 has been used at the larger urban landfill sites (Bantar Gebang, Sarimukti, etc.) where the methane volumes are sufficient to make capture economic. Cookstove and palm-oil-mill biogas (POME) projects use different methodologies (AMS-II.G. and AMS-III.H. respectively). With CDM winding down, large-scale landfill-gas projects in Indonesia are migrating to Verra's VM0026 or to PACM under Article 6.4.",
    category: 'methodology',
    relatedTerms: ['ams-iii-h', 'cdm', 'pome'],
    authoritySource: {
      url: 'https://cdm.unfccc.int/methodologies/LSmethodologies/approved.html',
      title: 'CDM Large-Scale Approved Methodologies',
    },
  },

  // ── Satellite / MRV technical terms ───────────────────────────────────────
  {
    slug: 'gfw',
    term: 'GFW',
    aliases: ['Global Forest Watch', 'globalforestwatch.org'],
    short:
      "World Resources Institute's open-data platform for forest monitoring — KarbonLens pulls weekly satellite-alert layers (RADD, GLAD-S2, VIIRS) from its API.",
    long:
      "GFW — Global Forest Watch — is the open-data platform operated by the World Resources Institute (WRI) that aggregates near-real-time satellite forest-monitoring layers and ancillary datasets. Its alert layers (RADD, GLAD-S2, GLAD-L, DIST-ALERT, VIIRS fire detections) are the de facto reference for forest-loss monitoring across the Indonesian forest estate.\n\nKarbonLens uses the GFW Integrated Alerts API on a weekly cron, pulling new alerts intersected with each project's polygon buffer. The alert volume drives the reversal-risk sub-score in the integrity methodology (35% of the composite). API access is free for registered users at globalforestwatch.org/help/developers/; KarbonLens stores the key as GFW_API_KEY and respects the 1 req/sec rate limit. Layer-specific licensing varies: RADD is Wageningen-licensed; GLAD layers are Maryland-licensed; both permit derivative use with attribution.",
    category: 'technical',
    relatedTerms: ['radd', 'glad', 'mrv'],
    authoritySource: {
      url: 'https://www.globalforestwatch.org/',
      title: 'Global Forest Watch',
    },
  },
  {
    slug: 'radd',
    term: 'RADD',
    aliases: ['Radar for Detecting Deforestation', 'Wageningen RADD'],
    short:
      "Wageningen University's near-real-time radar-based deforestation alert — uses Sentinel-1 SAR to detect tropical forest loss even through cloud cover.",
    long:
      "RADD — Radar for Detecting Deforestation — is a near-real-time deforestation alert system developed by Wageningen University, based on Sentinel-1 synthetic-aperture radar (SAR) imagery from the European Space Agency. Unlike optical sensors (Sentinel-2, Landsat), SAR penetrates cloud cover, making RADD particularly valuable in the perpetually-cloudy Indonesian tropics where optical alerts (GLAD-S2) frequently miss the actual disturbance window.\n\nRADD alerts are published to GFW with a typical latency of a few days from the underlying Sentinel-1 acquisition. The product covers Indonesia and the rest of the tropics at 10m resolution. RADD is the highest-priority alert layer in the KarbonLens integrity-score MRV pipeline because of its tropics-focused, cloud-piercing reliability; GLAD-S2 and DIST-ALERT serve as cross-checks.",
    category: 'technical',
    relatedTerms: ['gfw', 'glad', 'mrv'],
    authoritySource: {
      url: 'https://www.globalforestwatch.org/blog/data-and-research/radd-deforestation-alert/',
      title: 'GFW — about RADD',
    },
  },
  {
    slug: 'glad',
    term: 'GLAD',
    aliases: ['Global Land Analysis and Discovery', 'GLAD-L', 'GLAD-S2'],
    short:
      "Maryland's optical-satellite deforestation alert family — GLAD-L from Landsat (30 m) and GLAD-S2 from Sentinel-2 (10 m), updated multiple times per week.",
    long:
      "GLAD — Global Land Analysis and Discovery — is the laboratory at the University of Maryland that produces the GLAD-L (Landsat-based, 30m resolution) and GLAD-S2 (Sentinel-2-based, 10m resolution) deforestation alert layers. Both are optical-imagery products: cloud-free pixels are required, so the alert latency in the Indonesian tropics can extend to weeks during the rainy season.\n\nGLAD alerts complement RADD (radar-based) in the GFW integrated-alerts stack. The combined product flags a pixel as confirmed deforestation once any two of {RADD, GLAD-S2, GLAD-L} have flagged it independently. For the KarbonLens reversal-risk methodology, both unconfirmed (single-source) and confirmed (multi-source) GLAD alerts are recorded; only confirmed alerts within the project buffer contribute to the integrity-score penalty.",
    category: 'technical',
    relatedTerms: ['radd', 'gfw', 'mrv'],
    authoritySource: {
      url: 'https://glad.umd.edu/',
      title: 'University of Maryland GLAD Lab',
    },
  },
  {
    slug: 'corsia',
    term: 'CORSIA',
    aliases: ['Carbon Offsetting and Reduction Scheme for International Aviation'],
    short:
      "ICAO's global market-based scheme requiring international airlines to offset emissions growth above a baseline using ICAO-approved carbon-credit categories.",
    long:
      "CORSIA — the Carbon Offsetting and Reduction Scheme for International Aviation — is the global market-based mechanism agreed by the International Civil Aviation Organization (ICAO) to address international aviation emissions. It requires participating airlines to offset their CO₂ emissions above a baseline (2019 levels for the First Phase, 2024-2026; 85% of 2019 levels for the post-pilot CORSIA Phase). Offsetting must use 'CORSIA Eligible Emissions Units' — credits from registries (Verra, ART/TREES, Gold Standard, ACR, CAR, CDM successors) whose specific programmes have been approved by the ICAO Technical Advisory Body.\n\nFor Indonesian forestry credits, eligibility under CORSIA depends on the specific methodology and vintage: not every VCS credit qualifies, and many Indonesian Verra projects have been outside the CORSIA-eligible date window. Article 6 cooperation has the potential to channel Indonesian credits to CORSIA buyers via ITMO transfers with corresponding adjustments.",
    category: 'market',
    relatedTerms: ['itmo', 'article-6', 'vcs', 'icvcm'],
    authoritySource: {
      url: 'https://www.icao.int/environmental-protection/CORSIA/',
      title: 'ICAO CORSIA',
    },
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
