/**
 * lib/seo/autopilot/opportunities.ts — the autopilot "what should we work on" brain.
 *
 * Detectors read live GSC data (seo_keyword_ranks) + the content DB and emit
 * ranked `Opportunity` candidates with verified `grounding` facts. The N8N
 * workflow hits GET /api/seo/opportunities, takes the top candidate(s), and
 * feeds the brief + grounding to the LLM.
 *
 * Fact keys here MUST stay in lock-step with the reverify families in
 * lib/seo/autopilot/gate.ts — the gate independently recomputes each one.
 *
 * Sequenced by ROI (the user picked all four work-types):
 *   - editorial   ✅ live — striking-distance queries (pos 8–30) we under-serve.
 *   - meta        ✅ live — high-impression, low-CTR pages to retitle.
 *   - glossary    ✅ live — methodology codes used by projects with no glossary page.
 *   - internal_link / programmatic — detectors land with their apply-surfaces.
 */

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { listTerms } from '@/lib/data/glossary';
import type { GroundingFact, Opportunity } from './types';

// Position band where a nudge (better content / title) most plausibly moves
// us onto page 1. Below 8 we already rank; past 30 content alone rarely helps.
const STRIKING_MIN = 8;
const STRIKING_MAX = 30;
const MIN_IMPRESSIONS = 5; // low bar — the domain is young

// Rough organic CTR-by-position curve (desktop+mobile blended). Used to spot
// pages that earn far fewer clicks than their rank should yield.
function expectedCtr(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 2) return 0.15;
  if (position <= 3) return 0.1;
  if (position <= 5) return 0.06;
  if (position <= 10) return 0.025;
  return 0.01;
}

async function latestIdxFacts(): Promise<GroundingFact[]> {
  const rows = (await db.execute(sql`
    SELECT TO_CHAR(period_month, 'YYYY-MM') AS month,
           avg_price_idr::text             AS avg_price_idr,
           total_volume_tco2e::text        AS total_volume_tco2e
    FROM idx_monthly_snapshots
    ORDER BY period_month DESC
    LIMIT 1
  `)) as unknown as Array<{ month: string; avg_price_idr: string | null; total_volume_tco2e: string | null }>;
  const r = rows[0];
  if (!r) return [];
  const facts: GroundingFact[] = [];
  if (r.avg_price_idr !== null)
    facts.push({
      key: `idx_price:${r.month}:avg_price_idr`,
      label: `IDXCarbon avg price ${r.month}`,
      value: r.avg_price_idr,
      unit: 'IDR/tCO2e',
    });
  if (r.total_volume_tco2e !== null)
    facts.push({
      key: `idx_price:${r.month}:total_volume_tco2e`,
      label: `IDXCarbon traded volume ${r.month}`,
      value: r.total_volume_tco2e,
      unit: 'tCO2e',
    });
  return facts;
}

async function projectFacts(slug: string): Promise<GroundingFact[]> {
  const rows = (await db.execute(sql`
    SELECT p.name_canonical, p.province,
           (SELECT r.registry_name FROM registries r
              WHERE r.project_id = p.id
                AND r.registry_name IS NOT NULL AND r.registry_name <> ''
              LIMIT 1) AS registry_name
    FROM projects p WHERE p.slug = ${slug} LIMIT 1
  `)) as unknown as Array<{ name_canonical: string; province: string | null; registry_name: string | null }>;
  const r = rows[0];
  if (!r) return [];
  const out: GroundingFact[] = [
    { key: `project:${slug}:name`, label: 'Project name', value: r.name_canonical },
  ];
  if (r.province) out.push({ key: `project:${slug}:province`, label: 'Province', value: r.province });
  if (r.registry_name)
    out.push({ key: `project:${slug}:registry`, label: 'Registry', value: r.registry_name });
  return out;
}

async function totalProjectsFact(): Promise<GroundingFact> {
  const rows = (await db.execute(
    sql`SELECT COUNT(*)::int AS n FROM projects WHERE country = 'ID'`,
  )) as unknown as Array<{ n: number }>;
  return {
    key: 'stat:total_projects',
    label: 'Indonesian projects tracked',
    value: rows[0]?.n ?? 0,
  };
}

/** Pick grounding facts appropriate to the page the query ranks on. */
async function groundingForPage(page: string): Promise<GroundingFact[]> {
  const path = (() => {
    try {
      return new URL(page).pathname;
    } catch {
      return page;
    }
  })();

  const facts: GroundingFact[] = [];
  const pm = /^\/projects\/([^/]+)$/.exec(path);
  if (pm && !/^by-/.test(pm[1])) facts.push(...(await projectFacts(pm[1])));
  if (/^\/prices/.test(path) || facts.length === 0) facts.push(...(await latestIdxFacts()));
  facts.push(await totalProjectsFact());

  // De-dupe by key.
  return Array.from(new Map(facts.map((f) => [f.key, f])).values());
}

// ── Editorial: striking-distance queries we under-serve ──────────────────────

export async function editorialOpportunities(limit = 8): Promise<Opportunity[]> {
  const rows = (await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (query, page)
        query, page, position
      FROM seo_keyword_ranks
      WHERE observed_date >= CURRENT_DATE - INTERVAL '10 days'
      ORDER BY query, page, observed_date DESC
    ),
    agg AS (
      SELECT query, page,
             SUM(impressions)::int AS impressions_28d,
             SUM(clicks)::int      AS clicks_28d
      FROM seo_keyword_ranks
      WHERE observed_date >= CURRENT_DATE - INTERVAL '28 days'
      GROUP BY query, page
    )
    SELECT l.query, l.page, l.position::float8 AS position,
           COALESCE(a.impressions_28d, 0) AS impressions_28d,
           COALESCE(a.clicks_28d, 0)      AS clicks_28d
    FROM latest l
    LEFT JOIN agg a USING (query, page)
    WHERE l.position BETWEEN ${STRIKING_MIN} AND ${STRIKING_MAX}
      AND COALESCE(a.impressions_28d, 0) >= ${MIN_IMPRESSIONS}
      -- skip queries already worked recently
      AND NOT EXISTS (
        SELECT 1 FROM seo_jobs j
        WHERE j.target_query = l.query
          AND j.job_type = 'editorial'
          AND j.status IN ('queued','generating','published')
          AND j.created_at >= NOW() - INTERVAL '30 days'
      )
    ORDER BY COALESCE(a.impressions_28d, 0) DESC, l.position ASC
    LIMIT ${limit * 3}
  `)) as unknown as Array<{
    query: string;
    page: string;
    position: number;
    impressions_28d: number;
    clicks_28d: number;
  }>;

  // Skip queries whose intent an existing post already covers (cheap title overlap).
  const existing = (await db.execute(sql`
    SELECT lower(title) AS title FROM news_posts
    WHERE published_at >= NOW() - INTERVAL '365 days'
  `)) as unknown as Array<{ title: string }>;
  const existingTitles = existing.map((e) => e.title);

  const out: Opportunity[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    const qWords = r.query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const covered = existingTitles.some(
      (t) => qWords.length > 0 && qWords.every((w) => t.includes(w)),
    );
    if (covered) continue;

    const grounding = await groundingForPage(r.page);
    const score = r.impressions_28d * (1 + (STRIKING_MAX - r.position) / STRIKING_MAX);
    out.push({
      jobType: 'editorial',
      ref: `editorial:${r.query}`,
      score: Math.round(score),
      reason: `Ranks ~#${r.position.toFixed(0)} for "${r.query}" with ${r.impressions_28d} impressions/28d but only ${r.clicks_28d} clicks — a focused page can push onto page 1.`,
      targetQuery: r.query,
      targetUrl: r.page,
      brief: `Write an authoritative, specifically-Indonesian piece that directly answers the search intent behind "${r.query}". Lead with the concrete data point, cite only the grounding facts provided, link to the related on-site pages, and avoid generic AI phrasing.`,
      grounding,
      hints: {
        suggestedKind: /vs|versus|compare|banding/i.test(r.query)
          ? 'comparison'
          : /harga|price|biaya/i.test(r.query)
            ? 'evergreen'
            : 'explainer',
        relatedUrls: [r.page],
      },
    });
  }
  return out;
}

// ── Meta / CTR: pages that rank well but under-earn clicks ────────────────────

export async function metaOpportunities(limit = 6): Promise<Opportunity[]> {
  const rows = (await db.execute(sql`
    WITH per_page AS (
      SELECT page,
             SUM(impressions)::int                          AS impressions_28d,
             SUM(clicks)::int                               AS clicks_28d,
             (SUM(impressions * position) / NULLIF(SUM(impressions),0))::float8 AS w_position
      FROM seo_keyword_ranks
      WHERE observed_date >= CURRENT_DATE - INTERVAL '28 days'
      GROUP BY page
    ),
    top_q AS (
      SELECT DISTINCT ON (page) page, query
      FROM seo_keyword_ranks
      WHERE observed_date >= CURRENT_DATE - INTERVAL '28 days'
      ORDER BY page, impressions DESC
    )
    SELECT p.page, p.impressions_28d, p.clicks_28d, p.w_position, t.query AS top_query
    FROM per_page p
    LEFT JOIN top_q t USING (page)
    WHERE p.impressions_28d >= 20
    ORDER BY p.impressions_28d DESC
    LIMIT ${limit * 3}
  `)) as unknown as Array<{
    page: string;
    impressions_28d: number;
    clicks_28d: number;
    w_position: number;
    top_query: string | null;
  }>;

  const out: Opportunity[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    const actualCtr = r.impressions_28d > 0 ? r.clicks_28d / r.impressions_28d : 0;
    const exp = expectedCtr(r.w_position);
    if (actualCtr >= exp * 0.6) continue; // already earning its fair share
    if (
      await jobExists(r.page, 'meta')
    )
      continue;
    const lostClicks = Math.round((exp - actualCtr) * r.impressions_28d);
    out.push({
      jobType: 'meta',
      ref: `meta:${r.page}`,
      score: lostClicks * 10,
      reason: `Ranks ~#${r.w_position.toFixed(0)} for "${r.top_query ?? '—'}" (${r.impressions_28d} impr/28d) but CTR is ${(actualCtr * 100).toFixed(1)}% vs ~${(exp * 100).toFixed(1)}% expected — a sharper title/description could recover ~${lostClicks} clicks/28d.`,
      targetQuery: r.top_query,
      targetUrl: r.page,
      brief: `Rewrite the <title> (≤60 chars) and meta description (≤155 chars) for this page to maximise CTR for "${r.top_query ?? ''}". Be specific and Indonesian-market-relevant; no clickbait, no fabricated numbers.`,
      grounding: [],
    });
  }
  return out;
}

async function jobExists(targetUrl: string, jobType: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT 1 FROM seo_jobs
    WHERE target_url = ${targetUrl} AND job_type = ${jobType}
      AND status IN ('queued','generating','published','applied')
      AND created_at >= NOW() - INTERVAL '30 days'
    LIMIT 1
  `)) as unknown as unknown[];
  return rows.length > 0;
}

// ── Glossary: methodology codes used by projects with no glossary page ────────

export async function glossaryOpportunities(limit = 6): Promise<Opportunity[]> {
  const haveSlugs = new Set(listTerms().map((t) => t.slug.toLowerCase()));
  const rows = (await db.execute(sql`
    SELECT DISTINCT lower(methodology) AS code, COUNT(*)::int AS n
    FROM projects
    WHERE country = 'ID' AND methodology IS NOT NULL AND methodology <> ''
    GROUP BY lower(methodology)
    ORDER BY n DESC
  `)) as unknown as Array<{ code: string; n: number }>;

  const out: Opportunity[] = [];
  for (const r of rows) {
    if (out.length >= limit) break;
    const slug = r.code.replace(/[^a-z0-9]+/g, '');
    if (!slug || haveSlugs.has(slug)) continue;
    out.push({
      jobType: 'glossary',
      ref: `glossary:${slug}`,
      score: r.n * 5,
      reason: `${r.n} tracked projects use methodology "${r.code.toUpperCase()}" but it has no glossary page — a dangling internal link + a missed long-tail term.`,
      targetQuery: r.code,
      targetUrl: `/glossary/${slug}`,
      brief: `Write a concise glossary entry for the carbon methodology "${r.code.toUpperCase()}": a one-sentence definition and a 2–4 paragraph explainer (60–150 words). Factual, neutral, no fabricated figures.`,
      grounding: [{ key: 'stat:total_projects', label: 'Projects tracked', value: 0 }],
    });
  }
  // Patch the real total into each (cheap single read).
  if (out.length > 0) {
    const f = await totalProjectsFact();
    for (const o of out) o.grounding = [f];
  }
  return out;
}

// ── Data reports: recurring, proprietary-data-grounded authority assets ───────
//
// Unlike the GSC-driven editorial detector, these surface from the data itself
// (a new IDXCarbon month lands; a quarter turns) and carry DEEP grounding so the
// LLM writes a genuinely data-rich report — the linkable "authority node" the
// SEO strategy is built on. They publish as editorial news_posts with
// kind='market_report'. Every fact is reverifiable in gate.ts (idx_price,
// proj_metric, stat families).

/** True once a report period has been attempted (any non-error status) — so a
 *  given month/quarter is generated exactly once. ('error' is allowed to retry.) */
async function reportHandled(targetQuery: string): Promise<boolean> {
  const rows = (await db.execute(sql`
    SELECT 1 FROM seo_jobs
    WHERE target_query = ${targetQuery}
      AND status IN ('queued', 'generating', 'qa_passed', 'qa_failed', 'published', 'rejected', 'skipped')
    LIMIT 1
  `)) as unknown as unknown[];
  return rows.length > 0;
}

async function totalIssuedCreditsFact(): Promise<GroundingFact> {
  const rows = (await db.execute(
    sql`SELECT COALESCE(SUM(total_vcus_issued), 0)::text AS v FROM projects WHERE country = 'ID'`,
  )) as unknown as Array<{ v: string }>;
  return {
    key: 'stat:total_issued_credits',
    label: 'Total credits issued (Indonesian projects tracked)',
    value: rows[0]?.v ?? '0',
    unit: 'tCO2e',
  };
}

/** Latest two IDXCarbon months × {avg price, volume, value} — all idx_price keys. */
async function idxRecapFacts(): Promise<GroundingFact[]> {
  const rows = (await db.execute(sql`
    SELECT TO_CHAR(period_month, 'YYYY-MM') AS month,
           avg_price_idr::text       AS avg_price_idr,
           total_volume_tco2e::text  AS total_volume_tco2e,
           total_value_idr::text     AS total_value_idr
    FROM idx_monthly_snapshots
    ORDER BY period_month DESC
    LIMIT 2
  `)) as unknown as Array<{
    month: string;
    avg_price_idr: string | null;
    total_volume_tco2e: string | null;
    total_value_idr: string | null;
  }>;
  const facts: GroundingFact[] = [];
  for (const r of rows) {
    if (r.avg_price_idr !== null)
      facts.push({
        key: `idx_price:${r.month}:avg_price_idr`,
        label: `IDXCarbon avg price ${r.month}`,
        value: r.avg_price_idr,
        unit: 'IDR/tCO2e',
      });
    if (r.total_volume_tco2e !== null)
      facts.push({
        key: `idx_price:${r.month}:total_volume_tco2e`,
        label: `IDXCarbon traded volume ${r.month}`,
        value: r.total_volume_tco2e,
        unit: 'tCO2e',
      });
    if (r.total_value_idr !== null)
      facts.push({
        key: `idx_price:${r.month}:total_value_idr`,
        label: `IDXCarbon traded value ${r.month}`,
        value: r.total_value_idr,
        unit: 'IDR',
      });
  }
  return facts;
}

/** Top-N Indonesian projects by issued credits — name + proj_metric facts. */
async function leagueTableFacts(n: number): Promise<GroundingFact[]> {
  const rows = (await db.execute(sql`
    SELECT slug, name_canonical, total_vcus_issued::text AS issued
    FROM projects
    WHERE country = 'ID' AND total_vcus_issued IS NOT NULL
    ORDER BY total_vcus_issued DESC
    LIMIT ${n}
  `)) as unknown as Array<{ slug: string; name_canonical: string; issued: string }>;
  const facts: GroundingFact[] = [];
  for (const r of rows) {
    facts.push({ key: `project:${r.slug}:name`, label: 'Project name', value: r.name_canonical });
    facts.push({
      key: `proj_metric:${r.slug}:vcus_issued`,
      label: `${r.name_canonical} — credits issued`,
      value: r.issued,
      unit: 'tCO2e',
    });
  }
  return facts;
}

export async function dataReportOpportunities(limit = 4): Promise<Opportunity[]> {
  const out: Opportunity[] = [];

  // 1. Monthly IDXCarbon recap — fires once per new snapshot month.
  const monthRows = (await db.execute(
    sql`SELECT TO_CHAR(period_month, 'YYYY-MM') AS month, EXTRACT(MONTH FROM period_month)::int AS m
        FROM idx_monthly_snapshots ORDER BY period_month DESC LIMIT 1`,
  )) as unknown as Array<{ month: string; m: number }>;
  const latest = monthRows[0];
  if (latest) {
    const key = `idxcarbon-recap-${latest.month}`;
    if (!(await reportHandled(key))) {
      const grounding = [
        ...(await idxRecapFacts()),
        await totalProjectsFact(),
        await totalIssuedCreditsFact(),
      ];
      out.push({
        jobType: 'editorial',
        ref: `report:${key}`,
        score: 100000, // reports lead the queue whenever one is due
        reason: `New IDXCarbon snapshot for ${latest.month} — publish the monthly market recap.`,
        targetQuery: key,
        targetUrl: '/prices',
        brief:
          `Write the KarbonLens IDXCarbon monthly market report for ${latest.month}. Lead with the headline ` +
          `average price, then a compact Markdown table comparing the latest two months' average price, traded ` +
          `volume, and traded value, followed by 2–4 short paragraphs of analysis on the trend and what it means ` +
          `for Indonesian carbon-market participants. Use ONLY the exact numbers in the grounding facts — do not ` +
          `compute new figures (no percentages, growth rates, or totals that aren't provided); describe direction ` +
          `in words. Link to /prices and /projects. Set kind to "market_report".`,
        grounding,
        hints: { suggestedKind: 'market_report', relatedUrls: ['/prices', '/projects'] },
      });
    }
  }

  // 2. Top-projects league table — fires once a quarter (Jan/Apr/Jul/Oct snapshot).
  if (latest && [1, 4, 7, 10].includes(latest.m)) {
    const q = Math.floor((latest.m - 1) / 3) + 1;
    const year = latest.month.slice(0, 4);
    const key = `top-projects-league-${year}-q${q}`;
    if (!(await reportHandled(key))) {
      const grounding = [...(await leagueTableFacts(10)), await totalProjectsFact(), await totalIssuedCreditsFact()];
      out.push({
        jobType: 'editorial',
        ref: `report:${key}`,
        score: 90000,
        reason: `Quarterly league table due (${year} Q${q}) — rank Indonesia's top carbon projects by issued credits.`,
        targetQuery: key,
        targetUrl: '/projects',
        brief:
          `Write the KarbonLens ${year} Q${q} league table of Indonesia's largest carbon projects by credits issued. ` +
          `Present a ranked Markdown table (rank · project · credits issued) using ONLY the projects and exact ` +
          `issued-credit numbers in the grounding facts, then 2–3 paragraphs on what the ranking shows. Do NOT ` +
          `compute shares, sums, or any figure not in grounding. Link to /projects and each project's page where ` +
          `relevant. Set kind to "market_report".`,
        grounding,
        hints: { suggestedKind: 'market_report', relatedUrls: ['/projects'] },
      });
    }
  }

  return out.slice(0, limit);
}

export type OpportunityBundle = {
  generatedAt: string;
  counts: Record<string, number>;
  opportunities: Opportunity[];
};

/** Top opportunities across all live detectors, ranked by score. */
export async function allOpportunities(perType = 8): Promise<OpportunityBundle> {
  const [report, editorial, meta, glossary] = await Promise.all([
    dataReportOpportunities(perType),
    editorialOpportunities(perType),
    metaOpportunities(perType),
    glossaryOpportunities(perType),
  ]);
  const opportunities = [...report, ...editorial, ...meta, ...glossary].sort(
    (a, b) => b.score - a.score,
  );
  return {
    generatedAt: new Date().toISOString(),
    counts: {
      report: report.length,
      editorial: editorial.length,
      meta: meta.length,
      glossary: glossary.length,
    },
    opportunities,
  };
}
