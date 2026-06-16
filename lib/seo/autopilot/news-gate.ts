/**
 * lib/seo/autopilot/news-gate.ts — the Carbon News Brief citation GATE (WS3).
 *
 * News briefs link OUT to external sources, which the editorial gate forbids —
 * so they get their own fail-closed gate focused on attribution integrity:
 *   1. sources-valid  — every cited URL is a real ingested carbon_news_items row
 *                       (a fresh DB read; the LLM cannot cite a source we never
 *                       saw, which is the anti-fabrication spine for news).
 *   2. links-cited    — every external link in the body is one of those sources;
 *                       internal links resolve to allow-listed on-site paths.
 *   3. not-verbatim   — no long verbatim run copied from a source snippet
 *                       (summarise + link, never republish).
 *   4. slop-lint      — length bounds, banned AI-tells, no raw HTML.
 *   5. dedup          — slug free and the title isn't a near-duplicate.
 */

import { sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { carbonNewsItems } from '@/lib/schema';
import type { SeoJobQa } from '@/lib/schema';
import type { NewsBriefArtifact } from './types';

type Check = { name: string; ok: boolean; detail?: string };

const BODY_MIN = 1200;
const BODY_MAX = 30000;
const TITLE_MAX = 80;
const SUMMARY_MAX = 320;
const VERBATIM_RUN = 12; // words — a shared run this long counts as copying

const SLOP_PHRASES = [
  'in the ever-evolving', 'in the world of', 'in conclusion', 'in summary',
  'it is important to note', "it's important to note", 'it is worth noting',
  'when it comes to', 'navigating the', 'a testament to', 'plays a crucial role',
  'unlock the potential', 'ever-changing landscape', 'delve into', 'dive deep',
  'rich tapestry', 'game-changer', 'game changer',
];

const LINK_PREFIXES = [
  '/projects', '/prices', '/regulatory', '/methodology', '/glossary', '/news', '/',
];

const MD_LINK_RE = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

function words(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/** True if `body` contains any VERBATIM_RUN-word run from `snippet`. */
function sharesLongRun(bodyWords: string[], snippet: string): boolean {
  const sn = words(snippet);
  if (sn.length < VERBATIM_RUN) return false;
  const runs = new Set<string>();
  for (let i = 0; i + VERBATIM_RUN <= sn.length; i++) {
    runs.add(sn.slice(i, i + VERBATIM_RUN).join(' '));
  }
  for (let i = 0; i + VERBATIM_RUN <= bodyWords.length; i++) {
    if (runs.has(bodyWords.slice(i, i + VERBATIM_RUN).join(' '))) return true;
  }
  return false;
}

function dedupeKey(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function jaccard(a: string, b: string): number {
  const sa = new Set(dedupeKey(a).split(' ').filter(Boolean));
  const sb = new Set(dedupeKey(b).split(' ').filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

export async function runNewsBriefGate(art: NewsBriefArtifact): Promise<SeoJobQa> {
  const checks: Check[] = [];
  const body = art.bodyMd ?? '';
  const sources = Array.from(new Set((art.sources ?? []).map((u) => u.trim()).filter(Boolean)));

  // 1. sources-valid — every cited URL is a real ingested item (fresh DB read).
  const snippetByUrl = new Map<string, string | null>();
  if (sources.length > 0) {
    const rows = (await db
      .select({ url: carbonNewsItems.url, snippet: carbonNewsItems.snippet })
      .from(carbonNewsItems)
      .where(inArray(carbonNewsItems.url, sources))) as Array<{ url: string; snippet: string | null }>;
    for (const r of rows) snippetByUrl.set(r.url, r.snippet);
  }
  const missing = sources.filter((u) => !snippetByUrl.has(u));
  checks.push(
    sources.length === 0
      ? { name: 'sources-valid', ok: false, detail: 'no sources cited' }
      : missing.length > 0
        ? { name: 'sources-valid', ok: false, detail: `not ingested: ${missing.slice(0, 3).join(', ')}` }
        : { name: 'sources-valid', ok: true, detail: `${sources.length} sources verified` },
  );

  // 2. links-cited — external links ∈ sources; internal links allow-listed.
  {
    const bad: string[] = [];
    const sourceSet = new Set(sources);
    let m: RegExpExecArray | null;
    MD_LINK_RE.lastIndex = 0;
    while ((m = MD_LINK_RE.exec(body)) !== null) {
      const href = m[1];
      if (/^https?:\/\//i.test(href)) {
        if (!sourceSet.has(href)) bad.push(`${href} (external, not a cited source)`);
      } else if (href.startsWith('/')) {
        const path = href.split('#')[0].split('?')[0];
        if (!LINK_PREFIXES.some((p) => path === p || path.startsWith(p + '/') || path === '/')) {
          bad.push(`${href} (internal prefix not allow-listed)`);
        }
      } else {
        bad.push(`${href} (not relative or http)`);
      }
    }
    checks.push(
      bad.length === 0
        ? { name: 'links-cited', ok: true }
        : { name: 'links-cited', ok: false, detail: bad.slice(0, 4).join('; ') },
    );
  }

  // 3. not-verbatim — no long copied run from any source snippet.
  {
    const bodyWords = words(body);
    const copied = sources.find((u) => {
      const sn = snippetByUrl.get(u);
      return sn ? sharesLongRun(bodyWords, sn) : false;
    });
    checks.push(
      copied
        ? { name: 'not-verbatim', ok: false, detail: `verbatim run copied from ${copied}` }
        : { name: 'not-verbatim', ok: true },
    );
  }

  // 4. slop-lint
  {
    const issues: string[] = [];
    const lower = body.toLowerCase();
    if (body.length < BODY_MIN) issues.push(`body too short (${body.length}<${BODY_MIN})`);
    if (body.length > BODY_MAX) issues.push(`body too long (${body.length}>${BODY_MAX})`);
    if ((art.title ?? '').length > TITLE_MAX) issues.push(`title >${TITLE_MAX} chars`);
    if ((art.summary ?? '').length > SUMMARY_MAX) issues.push(`summary >${SUMMARY_MAX} chars`);
    if (/<\s*(script|iframe|style|on\w+=)/i.test(body)) issues.push('raw HTML/script in body');
    const hits = SLOP_PHRASES.filter((p) => lower.includes(p));
    if (hits.length > 0) issues.push(`AI-tells: ${hits.slice(0, 5).join(', ')}`);
    checks.push(
      issues.length === 0 ? { name: 'slop-lint', ok: true } : { name: 'slop-lint', ok: false, detail: issues.join('; ') },
    );
  }

  // 5. dedup — slug free + title not a near-duplicate of a recent post.
  {
    const slugRows = (await db.execute(
      sql`SELECT title FROM news_posts WHERE slug = ${art.slug} LIMIT 1`,
    )) as unknown as Array<{ title: string }>;
    if (slugRows.length > 0) {
      checks.push({ name: 'dedup', ok: false, detail: `slug '${art.slug}' already exists` });
    } else {
      const recent = (await db.execute(sql`
        SELECT title FROM news_posts
        WHERE kind = 'news_brief' AND published_at >= NOW() - INTERVAL '30 days'
        ORDER BY published_at DESC LIMIT 60
      `)) as unknown as Array<{ title: string }>;
      const near = recent.find((r) => jaccard(r.title, art.title) >= 0.7);
      checks.push(
        near
          ? { name: 'dedup', ok: false, detail: `near-duplicate of "${near.title}"` }
          : { name: 'dedup', ok: true },
      );
    }
  }

  return { passed: checks.every((c) => c.ok), checks };
}
