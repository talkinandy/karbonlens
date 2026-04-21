/**
 * KarbonLens — mock data for T03 bootstrap.
 *
 * This module is the sole source of seeded UI data for the six screens
 * during T03 (no database, no auth). Each screen imports from here with
 * a `// TODO T11+: replace with db query` comment at the import site.
 *
 * When T11+ lands real data:
 *   1. Delete this file.
 *   2. Replace every `import { mockX } from "@/lib/mock-data"` with the
 *      matching Drizzle query from `lib/db.ts`.
 *
 * Slug discipline: the three slugs declared in `mockProjects`
 * (`katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`) are the canonical
 * public slugs. T05 hardcodes these exact strings in its middleware negative
 * lookahead. Do not change them without coordinating with T05.
 */

export type ScoreBreakdown = {
  validation: number;
  reversal: number;
  community: number;
  transparency: number;
};

export type IssuancePoint = {
  year: number;
  value: number; // million VCUs
};

export type ProjectStatus = "active" | "pipeline" | "suspended" | "flagged";

export type MockProject = {
  slug: string;
  name: string;
  shortName: string;
  developer: string;
  type: string;
  subtype?: string;
  province: string;
  provinceShort: string;
  hectares: number;
  centroid?: [number, number];
  status: ProjectStatus;
  score: number;
  breakdown?: ScoreBreakdown;
  issued?: string;
  retired?: string;
  available: string;
  availableSort: number;
  lastVintage?: number;
  registries: string[];
  registriesShort: string;
  issuances?: IssuancePoint[];
};

export const mockProjects: MockProject[] = [
  {
    slug: "katingan-peatland",
    name: "Katingan Peatland Restoration",
    shortName: "Katingan Peatland",
    developer: "Rimba Makmur Utama",
    type: "REDD+",
    subtype: "Peatland",
    province: "Central Kalimantan",
    provinceShort: "C. Kalimantan",
    hectares: 149800,
    centroid: [-1.8, 113.2],
    status: "active",
    score: 82,
    breakdown: { validation: 90, reversal: 72, community: 85, transparency: 80 },
    issued: "32.5M",
    retired: "28.9M",
    available: "3.6M",
    availableSort: 3_600_000,
    lastVintage: 2020,
    registries: ["Verra", "SRN-PPI"],
    registriesShort: "V · SRN",
    issuances: [
      { year: 2017, value: 5.8 },
      { year: 2018, value: 7.9 },
      { year: 2019, value: 9.5 },
      { year: 2020, value: 8.7 },
    ],
  },
  {
    slug: "sumatra-merang-peat",
    name: "Sumatra Merang Peatland Project",
    shortName: "Sumatra Merang",
    developer: "Forest Carbon",
    type: "REDD+",
    subtype: "Peatland",
    province: "South Sumatra",
    provinceShort: "S. Sumatra",
    hectares: 22900,
    status: "active",
    score: 74,
    breakdown: { validation: 80, reversal: 62, community: 78, transparency: 75 },
    issued: "8.4M",
    retired: "7.2M",
    available: "1.2M",
    availableSort: 1_200_000,
    lastVintage: 2021,
    registries: ["Verra", "SRN-PPI"],
    registriesShort: "V · SRN",
    issuances: [
      { year: 2018, value: 1.6 },
      { year: 2019, value: 2.0 },
      { year: 2020, value: 2.4 },
      { year: 2021, value: 2.4 },
    ],
  },
  {
    slug: "rimba-raya",
    name: "Rimba Raya Conservation",
    shortName: "Rimba Raya",
    developer: "PT Rimba Raya",
    type: "REDD+",
    province: "Central Kalimantan",
    provinceShort: "C. Kalimantan",
    hectares: 36000,
    status: "flagged",
    score: 58,
    breakdown: { validation: 60, reversal: 42, community: 55, transparency: 70 },
    issued: "18.9M",
    retired: "14.8M",
    available: "4.1M",
    availableSort: 4_100_000,
    lastVintage: 2022,
    registries: ["Verra"],
    registriesShort: "V",
    issuances: [
      { year: 2019, value: 3.4 },
      { year: 2020, value: 3.9 },
      { year: 2021, value: 4.3 },
      { year: 2022, value: 4.8 },
    ],
  },
];

/** Public slug allow-list. Kept in sync with `mockProjects`; T05 mirrors this. */
export const PUBLIC_PROJECT_SLUGS: ReadonlySet<string> = new Set(
  mockProjects.map((p) => p.slug),
);

export type PricePoint = {
  month: string;
  idtbsRe: number | null;
  idtbs: number | null;
  idnbs: number | null;
};

export const mockPriceSeries: PricePoint[] = [
  { month: "Aug 2025", idtbsRe: 60, idtbs: 40, idnbs: 38 },
  { month: "Sep 2025", idtbsRe: 58, idtbs: 41, idnbs: null },
  { month: "Oct 2025", idtbsRe: 55, idtbs: 39, idnbs: 37 },
  { month: "Nov 2025", idtbsRe: 62, idtbs: 40, idnbs: null },
  { month: "Dec 2025", idtbsRe: 68, idtbs: 42, idnbs: 39 },
  { month: "Jan 2026", idtbsRe: 64, idtbs: 38, idnbs: 38 },
];

export type PriceStat = {
  label: string;
  value: string;
  delta: string;
};

export const mockPriceStats: PriceStat[] = [
  { label: "January volume", value: "117k t", delta: "↓ 38% vs Dec" },
  { label: "January value", value: "Rp 4.7B", delta: "↓ 36% vs Dec" },
  { label: "Avg price", value: "Rp 40k", delta: "≈ US$2.50/t" },
  { label: "Registered participants", value: "132", delta: "↑ 4 in month" },
];

export type TransactionRow = {
  date: string;
  market: string;
  creditType: string;
  project: string;
  volume: string;
  price: string;
};

export const mockTransactions: TransactionRow[] = [
  {
    date: "29 Jan",
    market: "Negotiated",
    creditType: "IDTBS",
    project: "Pertamina Lahendong",
    volume: "100,000 t",
    price: "Rp 37,500",
  },
  {
    date: "22 Jan",
    market: "Negotiated",
    creditType: "IDTBS-RE",
    project: "PLTM Gunung Wugul",
    volume: "16,596 t",
    price: "Rp 54,000",
  },
  {
    date: "15 Jan",
    market: "Marketplace",
    creditType: "IDTBS-RE",
    project: "PLTGU Muara Karang",
    volume: "846 t",
    price: "Rp 64,100",
  },
  {
    date: "9 Jan",
    market: "Negotiated",
    creditType: "IDTBS",
    project: "Pertamina Lahendong",
    volume: "45,000 t",
    price: "Rp 38,200",
  },
];

export type RegulatoryImportance = "critical" | "high" | "medium" | "low";

export type MockRegulatoryEvent = {
  id: string;
  eventDate: string;
  status: string;
  title: string;
  summary: string;
  importance: RegulatoryImportance;
  tags: string[];
  isUpcoming?: boolean;
};

export const mockRegulatoryEvents: MockRegulatoryEvent[] = [
  {
    id: "permenhut-6-2026",
    eventDate: "13 Apr 2026",
    status: "Diundangkan",
    title: "Permenhut 6/2026 — Tata Cara Perdagangan Karbon Offset GRK Kehutanan",
    summary:
      "Implements forestry offset pathway under Perpres 110/2025. Re-enables forestry REDD+/peatland credits after 4-year freeze. Establishes eligible actors (PBPH, perhutanan sosial, hutan adat, hutan hak, PB-PJL Karbon), registered mitra/pendamping requirement, Padiatapa mandate, Nesting requirement, and PNBP on transactions.",
    importance: "critical",
    tags: ["Kemenhut", "Forestry", "REDD+"],
  },
  {
    id: "perpres-110-2025",
    eventDate: "Oct 2025",
    status: "Diundangkan",
    title: "Perpres 110/2025 — Penyelenggaraan Instrumen NEK",
    summary:
      "Replaces Perpres 98/2021. Establishes SRUK (Sistem Registri Unit Karbon) alongside SRN-PPI, introduces Corresponding Adjustment framework, re-opens international carbon trade after 2021 moratorium.",
    importance: "critical",
    tags: ["Presidential", "All sectors"],
  },
  {
    id: "verra-mra",
    eventDate: "Oct 2025",
    status: "MoU signed",
    title: "Verra–Indonesia Mutual Recognition Agreement",
    summary:
      "VCS projects may pursue parallel registration with SRN-PPI. VCUs remain in Verra Registry but mirrored in SRN-PPI for NDC accounting. Dual-track process operational.",
    importance: "high",
    tags: ["KLH", "International"],
  },
  {
    id: "srn-ppi-v2",
    eventDate: "Aug 2025",
    status: "Launched",
    title: "SRN-PPI v2 — Upgraded climate registry",
    summary:
      "Improved data visualization, streamlined verification procedures, enhanced NDC tracking. API access roadmap announced.",
    importance: "medium",
    tags: ["KLH"],
  },
  {
    id: "idxcarbon-international",
    eventDate: "Jan 2025",
    status: "Opened",
    title: "IDXCarbon opens to international buyers",
    summary:
      "First international transactions: ~41,822 tCO₂e on day one. Natural gas credits traded at ~US$5.87/ton, hydroelectric at US$8.82/ton.",
    importance: "high",
    tags: ["OJK", "IDX"],
  },
  {
    id: "pnbp-rate-determination",
    eventDate: "Expected Q3 2026",
    status: "Upcoming",
    title: "PNBP rate determination (Permenhut follow-up)",
    summary:
      "Rate for Non-Tax State Revenue on carbon trading transactions (mandated by Permenhut 6/2026 Pasal 46) expected to be set via separate Permen. Industry estimates 10–20% of gross transaction value.",
    importance: "high",
    tags: ["Upcoming", "Kemenhut"],
    isUpcoming: true,
  },
  {
    id: "fiscal-regime-permen",
    eventDate: "Expected Oct 2026",
    status: "Upcoming",
    title: "Fiscal regime & buffer mechanism Permen",
    summary:
      "Technical parameters for buffer pool contributions, fiscal treatment of CA-authorized credits, and ITMO accounting.",
    importance: "medium",
    tags: ["Upcoming", "Multi-ministry"],
    isUpcoming: true,
  },
];

export type AlertSeverity = "info" | "success" | "warning" | "danger";

export type MockAlert = {
  id: string;
  type: "reversal" | "price" | "regulatory" | "news" | "retirement" | "issuance";
  severity: AlertSeverity;
  typeLabel: string;
  project: string;
  time: string;
  read: boolean;
  title: string;
  description: string;
};

/**
 * Alerts inbox starts empty per T03 spec — the empty state is what the page
 * should render. T11+ populates this from the notifications table.
 */
export const mockAlerts: MockAlert[] = [];
