/**
 * lib/seo/plan.ts — SEO Phase 1 punch-list source of truth.
 *
 * Code-side immutable metadata for the SEO punch list. The seo_tasks DB
 * table carries mutable state (status / closed_at / notes). On first dashboard
 * read, missing rows are seeded into seo_tasks with status='pending'. Renaming
 * a code here will create an orphan DB row — leave codes stable.
 *
 * Codes are stable opaque identifiers; titles can change without affecting
 * the DB join.
 */

export type SeoTaskPriority = 'P0' | 'P1' | 'P2';
export type SeoTaskKind = 'tech' | 'content' | 'authority' | 'programmatic';

export type SeoTaskDef = {
  code: string;
  priority: SeoTaskPriority;
  kind: SeoTaskKind;
  title: string;
  description: string;
};

export const SEO_PLAN: SeoTaskDef[] = [
  // ── Phase 1: blockers (B1–B4) — what this PR ships ─────────────────────────
  {
    code: 'B1',
    priority: 'P0',
    kind: 'tech',
    title: 'Cache-Control: private on public pages',
    description:
      'Every public page emits Cache-Control: private, no-cache because auth() taints the whole route. Isolate auth() into Suspense islands so a future cacheComponents rollout can cache the static shell; meanwhile override Cache-Control at nginx for known-public paths.',
  },
  {
    code: 'B2',
    priority: 'P0',
    kind: 'tech',
    title: 'Soft-404 on unknown project slugs',
    description:
      "loading.tsx commits HTTP 200 before the page calls notFound(). Call notFound() from generateMetadata so the 404 status lands before any streaming.",
  },
  {
    code: 'B3',
    priority: 'P0',
    kind: 'tech',
    title: 'Sitemap missing newly-published news posts',
    description:
      'Sitemap is cached at deploy and never revalidated. Add revalidate=600 and call revalidatePath(/sitemap.xml) from the weekly Market Wrap publisher.',
  },
  {
    code: 'B4',
    priority: 'P0',
    kind: 'authority',
    title: 'Claim GSC + BWT + Yandex Webmaster',
    description:
      'GSC verification meta is already deployed but the property has never been claimed. BWT import-from-GSC unblocks the IndexNow 422. Yandex needs DNS TXT. Runbook: docs/runbooks/seo-search-engine-onboarding.md.',
  },

  // ── P1 — landing in Phase 2 ────────────────────────────────────────────────
  {
    code: 'P1-www-redirect',
    priority: 'P1',
    kind: 'tech',
    title: 'www.karbonlens.com → apex 301',
    description: 'nginx server block (see runbook §6). Duplicate-content signal today.',
  },
  {
    code: 'P1-security-headers',
    priority: 'P1',
    kind: 'tech',
    title: 'HSTS + X-Content-Type-Options + X-Frame-Options',
    description: 'nginx add_header block (see runbook §5). Minor ranking signal + privacy hygiene.',
  },
  {
    code: 'P1-hub-canonicals',
    priority: 'P1',
    kind: 'tech',
    title: 'Canonical tags on /, /projects, /prices, /regulatory, by-* hubs',
    description: 'Param-permutation duplicates eat hub PageRank.',
  },
  {
    code: 'P1-about-page',
    priority: 'P1',
    kind: 'authority',
    title: '/about, /data-sources, /press, /methodology/changelog',
    description: 'Top E-E-A-T deficit per the audit. /about + author byline + sameAs.',
  },
  {
    code: 'P1-org-sameas',
    priority: 'P1',
    kind: 'authority',
    title: 'Populate Organization.sameAs',
    description: 'app/layout.tsx — add GitHub repo, LinkedIn, X. Currently [].',
  },
  {
    code: 'P1-permenhut-explainer',
    priority: 'P1',
    kind: 'content',
    title: '"Permenhut 6/2026 dijelaskan" + EN twin',
    description: 'Quick-win content #1. Anchor for regulatory-explainer cluster.',
  },
  {
    code: 'P1-prices-evergreen',
    priority: 'P1',
    kind: 'content',
    title: 'Evergreen "Harga karbon Indonesia 2025–2026" landing',
    description: 'Aggregates monthly snapshots; ranks for "harga karbon Indonesia" perpetually.',
  },
  {
    code: 'P1-registry-comparison',
    priority: 'P1',
    kind: 'content',
    title: 'Verra vs SRN-PPI vs IDXCarbon comparison page',
    description: 'Zero-competition keyword; pure data → narrative.',
  },
  {
    code: 'P1-prices-dataset-schema',
    priority: 'P1',
    kind: 'tech',
    title: 'Add Dataset + DataDownload JSON-LD to /prices',
    description: 'Structured-data goldmine currently emits only Organization+WebSite.',
  },
  {
    code: 'P1-glossary-expand',
    priority: 'P1',
    kind: 'programmatic',
    title: 'Expand glossary 22 → 80 entries',
    description: 'Closes dangling methodology-code links from project pages. Cheapest density win.',
  },
  {
    code: 'P1-prices-backfill',
    priority: 'P1',
    kind: 'programmatic',
    title: 'Backfill /prices/[YYYY-MM] for all months we have data for',
    description: 'Cheap, high-authority. Set ~10 today, target ~60 over 5 years of history.',
  },

  // ── P2 — Phase 3+ ──────────────────────────────────────────────────────────
  {
    code: 'P2-cross-facet-hubs',
    priority: 'P2',
    kind: 'programmatic',
    title: 'province × methodology cross-facet hubs',
    description: 'Only emit pairs with ≥2 projects to avoid empty Cartesian products.',
  },
  {
    code: 'P2-vintage-hubs',
    priority: 'P2',
    kind: 'programmatic',
    title: '/projects/by-vintage/[YYYY] (~15 pages)',
    description: 'Vintage-year landing pages with IDX price context.',
  },
  {
    code: 'P2-per-project-issuances',
    priority: 'P2',
    kind: 'programmatic',
    title: '/projects/[slug]/issuances/[YYYY] (~300 pages)',
    description: 'Per-project per-vintage drill-down.',
  },
  {
    code: 'P2-project-monthly-alerts',
    priority: 'P2',
    kind: 'programmatic',
    title: '/projects/[slug]/alerts/[YYYY-MM] (months with ≥3 alerts)',
    description: 'Investigative-press backlink magnet. Includes satellite map clip OG image.',
  },
  {
    code: 'P2-id-locale',
    priority: 'P2',
    kind: 'content',
    title: 'Indonesian-locale rollout under /id/',
    description: 'Top 3 templates (project, province, glossary) first. hreflang en-id ↔ id-id.',
  },
  {
    code: 'P2-pr-mongabay-alerts',
    priority: 'P2',
    kind: 'authority',
    title: 'Mongabay pitch: "247k alerts mapped to Verra projects"',
    description: 'Highest-leverage digital PR angle. Reuters/CarbonPulse also viable.',
  },
  {
    code: 'P2-awesome-lists',
    priority: 'P2',
    kind: 'authority',
    title: 'PR to awesome-climate, awesome-opendata, awesome-geospatial, awesome-nextjs',
    description: '4 PRs × 1h each. Passive backlink + GitHub authority.',
  },
  {
    code: 'P2-wikipedia-citations',
    priority: 'P2',
    kind: 'authority',
    title: 'Wikipedia citation edits',
    description: '"Indonesian carbon market", "SRN-PPI", "IDXCarbon", "REDD+ in Indonesia". Neutral edits only.',
  },
  {
    code: 'P2-kaggle-dataset',
    priority: 'P2',
    kind: 'authority',
    title: 'Mirror dataset to Kaggle + Hugging Face',
    description: 'Tag indonesia-carbon. Kaggle pages rank fast and become backlinks.',
  },
  {
    code: 'P2-show-hn',
    priority: 'P2',
    kind: 'authority',
    title: 'Show HN: open-source intel for Indonesia\'s carbon market',
    description: 'Tuesday 09:00 ET. OSS + bilingual + Indonesian-built angle.',
  },
];

export function planByPriority(): Record<SeoTaskPriority, SeoTaskDef[]> {
  const out: Record<SeoTaskPriority, SeoTaskDef[]> = { P0: [], P1: [], P2: [] };
  for (const t of SEO_PLAN) out[t.priority].push(t);
  return out;
}

export function planByCode(): Map<string, SeoTaskDef> {
  return new Map(SEO_PLAN.map((t) => [t.code, t]));
}
