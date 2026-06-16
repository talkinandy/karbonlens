/**
 * lib/seo/autopilot/gate.ts — the autopilot fact-check GATE.
 *
 * The user chose "auto-publish behind a hard fact-check gate" — no human in
 * the loop. That makes this module the only thing standing between an LLM and
 * production, on a credibility-dependent market-intel site. It is deliberately
 * fail-closed: any check that cannot be positively verified returns ok:false.
 *
 * Six checks for editorial artifacts:
 *   1. claims-grounded   — every claim cites a grounding fact and matches it.
 *   2. numbers-declared  — no undeclared material number appears in the body.
 *   3. grounding-reverify — every grounding fact is recomputed from the DB;
 *                           N8N cannot smuggle a fabricated number through.
 *   4. dedup             — slug is free and the title isn't a near-duplicate.
 *   5. slop-lint         — length bounds, banned AI-tells, no raw HTML/script.
 *   6. links-valid       — internal links resolve to real on-site paths.
 *
 * The grounding the caller echoes back is NEVER trusted on its own — check 3
 * recomputes each fact straight from Postgres, so trust flows from the DB, not
 * from N8N.
 */

import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { getTermBySlug } from '@/lib/data/glossary';
import type { SeoJobQa } from '@/lib/schema';
import type { EditorialArtifact, GroundingFact } from './types';

type Check = { name: string; ok: boolean; detail?: string };

const BODY_MIN = 1500; // chars — below this it's thin content
const BODY_MAX = 30000;
const TITLE_MAX = 70;
const SUMMARY_MAX = 320;

// AI-tell phrases the user explicitly wants avoided ("avoid sounds like AI").
const SLOP_PHRASES = [
  'in the ever-evolving',
  'in the world of',
  'in conclusion',
  'in summary',
  'it is important to note',
  "it's important to note",
  'it is worth noting',
  'when it comes to',
  'navigating the',
  'a testament to',
  'plays a crucial role',
  'plays a vital role',
  'plays a pivotal role',
  'unlock the potential',
  'in today',
  'ever-changing landscape',
  'delve into',
  'dive deep',
  'rich tapestry',
  'game-changer',
  'game changer',
];

function normNum(v: string | number): number | null {
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Two values match if numerically within 0.5%, or string-equal (case-insensitive). */
function valuesMatch(a: string | number, b: string | number): boolean {
  const na = normNum(a);
  const nb = normNum(b);
  if (na !== null && nb !== null) {
    if (na === nb) return true;
    const denom = Math.max(Math.abs(na), Math.abs(nb), 1);
    return Math.abs(na - nb) / denom <= 0.005;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

// ── Check 3: recompute each grounding fact straight from the DB ──────────────
// Fact keys are self-describing: "<family>:<args…>:<field>". Unknown families
// fail closed. Keep these in lock-step with lib/seo/autopilot/opportunities.ts.

async function reverifyFact(fact: GroundingFact): Promise<Check> {
  const parts = fact.key.split(':');
  const family = parts[0];
  const name = `reverify:${fact.key}`;

  try {
    if (family === 'idx_price') {
      // idx_price:<YYYY-MM>:<field>
      const [, month, field] = parts;
      const col =
        field === 'avg_price_idr'
          ? sql`avg_price_idr`
          : field === 'total_volume_tco2e'
            ? sql`total_volume_tco2e`
            : field === 'total_value_idr'
              ? sql`total_value_idr`
              : null;
      if (!col) return { name, ok: false, detail: `unknown idx_price field '${field}'` };
      const rows = (await db.execute(sql`
        SELECT ${col}::text AS v
        FROM idx_monthly_snapshots
        WHERE TO_CHAR(period_month, 'YYYY-MM') = ${month}
        ORDER BY scraped_at DESC
        LIMIT 1
      `)) as unknown as Array<{ v: string | null }>;
      const v = rows[0]?.v ?? null;
      if (v === null) return { name, ok: false, detail: 'no snapshot for month' };
      return { name, ok: valuesMatch(v, fact.value), detail: `db=${v} stated=${fact.value}` };
    }

    if (family === 'project') {
      // project:<slug>:<field>  (field: name | province | registry)
      const [, slug, field] = parts;
      const rows = (await db.execute(sql`
        SELECT name_canonical, province, registry_name
        FROM projects WHERE slug = ${slug} LIMIT 1
      `)) as unknown as Array<{
        name_canonical: string;
        province: string | null;
        registry_name: string | null;
      }>;
      const r = rows[0];
      if (!r) return { name, ok: false, detail: 'project not found' };
      const dbVal =
        field === 'name' ? r.name_canonical : field === 'province' ? r.province : r.registry_name;
      if (dbVal === null || dbVal === undefined)
        return { name, ok: false, detail: `null ${field}` };
      return { name, ok: valuesMatch(dbVal, fact.value), detail: `db=${dbVal}` };
    }

    if (family === 'regulatory') {
      // regulatory:<slug>:title
      const [, slug] = parts;
      const rows = (await db.execute(sql`
        SELECT title FROM regulatory_events
        WHERE LOWER(REPLACE(REPLACE(COALESCE(document_type,'')||'-'||COALESCE(document_number,''),'/','-'),' ','-')) = ${slug}
        LIMIT 1
      `)) as unknown as Array<{ title: string }>;
      const r = rows[0];
      if (!r) return { name, ok: false, detail: 'regulatory event not found' };
      return { name, ok: valuesMatch(r.title, fact.value), detail: `db title` };
    }

    if (family === 'stat') {
      // stat:<which>  (total_projects | total_issued_credits)
      const which = parts[1];
      if (which === 'total_projects') {
        const rows = (await db.execute(
          sql`SELECT COUNT(*)::int AS n FROM projects WHERE country = 'ID'`,
        )) as unknown as Array<{ n: number }>;
        return { name, ok: valuesMatch(rows[0]?.n ?? 0, fact.value), detail: `db=${rows[0]?.n}` };
      }
      return { name, ok: false, detail: `unknown stat '${which}'` };
    }

    return { name, ok: false, detail: `unknown fact family '${family}' (fail-closed)` };
  } catch (e) {
    return { name, ok: false, detail: `reverify error: ${e instanceof Error ? e.message : e}` };
  }
}

// ── Check 2: pull material numbers out of the prose ──────────────────────────
// "Material" = a number that carries a unit or is large enough to be a claim,
// excluding 4-digit years and small ordinals/list markers. Each must be
// declared as a claim so check 1 + 3 can verify it.
function extractMaterialNumbers(body: string): string[] {
  const out: string[] = [];
  // Numbers with thousands separators or decimals, optionally % / currency-ish.
  const re = /\b(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+|\d{4,})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const raw = m[1];
    const n = normNum(raw);
    if (n === null) continue;
    // Skip bare 4-digit years 1990–2099 (dates, vintages).
    if (/^\d{4}$/.test(raw) && n >= 1990 && n <= 2099) continue;
    out.push(raw);
  }
  return Array.from(new Set(out));
}

function dedupeKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Cheap token Jaccard — good enough to catch "same post reworded". */
function jaccard(a: string, b: string): number {
  const sa = new Set(dedupeKey(a).split(' ').filter(Boolean));
  const sb = new Set(dedupeKey(b).split(' ').filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter += 1;
  return inter / (sa.size + sb.size - inter);
}

const LINK_PREFIXES = [
  '/projects',
  '/prices',
  '/regulatory',
  '/methodology',
  '/glossary',
  '/news',
  '/',
];

async function checkLinks(links: string[]): Promise<Check> {
  if (links.length === 0) return { name: 'links-valid', ok: true, detail: 'no internal links' };
  const bad: string[] = [];
  for (const raw of links) {
    const href = raw.split('#')[0].split('?')[0];
    if (!href.startsWith('/')) {
      bad.push(`${raw} (not relative)`);
      continue;
    }
    if (!LINK_PREFIXES.some((p) => href === p || href.startsWith(p + '/') || href === '/')) {
      bad.push(`${raw} (prefix not allowlisted)`);
      continue;
    }
    // Verify dynamic slugs actually resolve.
    const gm = /^\/glossary\/([^/]+)$/.exec(href);
    if (gm && !getTermBySlug(gm[1])) {
      bad.push(`${raw} (glossary term missing)`);
      continue;
    }
    const pm = /^\/projects\/([^/]+)$/.exec(href);
    if (pm && !/^by-/.test(pm[1])) {
      const rows = (await db.execute(
        sql`SELECT 1 FROM projects WHERE slug = ${pm[1]} LIMIT 1`,
      )) as unknown as unknown[];
      if (rows.length === 0) bad.push(`${raw} (project slug missing)`);
    }
    const nm = /^\/news\/([^/]+)$/.exec(href);
    if (nm) {
      const rows = (await db.execute(
        sql`SELECT 1 FROM news_posts WHERE slug = ${nm[1]} LIMIT 1`,
      )) as unknown as unknown[];
      if (rows.length === 0) bad.push(`${raw} (news slug missing)`);
    }
  }
  return bad.length === 0
    ? { name: 'links-valid', ok: true, detail: `${links.length} links ok` }
    : { name: 'links-valid', ok: false, detail: bad.join('; ') };
}

/**
 * Run the full gate on an editorial artifact. Returns a SeoJobQa with one
 * entry per check. `passed` is true only if every check passed.
 */
export async function runEditorialGate(art: EditorialArtifact): Promise<SeoJobQa> {
  const checks: Check[] = [];
  const claims = art.claims ?? [];
  const grounding = (art as unknown as { grounding?: GroundingFact[] }).grounding ?? [];
  const groundingByKey = new Map(grounding.map((f) => [f.key, f]));

  // 1. claims-grounded
  {
    const bad: string[] = [];
    for (const c of claims) {
      const f = groundingByKey.get(c.factKey);
      if (!f) bad.push(`${c.factKey} (no such grounding fact)`);
      else if (!valuesMatch(c.statedValue, f.value))
        bad.push(`${c.factKey} stated=${c.statedValue} grounded=${f.value}`);
    }
    checks.push(
      bad.length === 0
        ? { name: 'claims-grounded', ok: true, detail: `${claims.length} claims ok` }
        : { name: 'claims-grounded', ok: false, detail: bad.join('; ') },
    );
  }

  // 2. numbers-declared
  {
    const declared = new Set(claims.map((c) => normNum(c.statedValue)).filter((n) => n !== null));
    const undeclared = extractMaterialNumbers(art.bodyMd).filter((raw) => {
      const n = normNum(raw);
      return n !== null && !declared.has(n);
    });
    checks.push(
      undeclared.length === 0
        ? { name: 'numbers-declared', ok: true }
        : {
            name: 'numbers-declared',
            ok: false,
            detail: `undeclared numbers in body: ${undeclared.slice(0, 8).join(', ')}`,
          },
    );
  }

  // 3. grounding-reverify (independent DB read)
  {
    const results = await Promise.all(grounding.map(reverifyFact));
    const failed = results.filter((r) => !r.ok);
    checks.push(
      failed.length === 0
        ? { name: 'grounding-reverify', ok: true, detail: `${grounding.length} facts verified` }
        : {
            name: 'grounding-reverify',
            ok: false,
            detail: failed.map((f) => `${f.name}: ${f.detail}`).join(' | '),
          },
    );
  }

  // 4. dedup
  {
    const slugRows = (await db.execute(
      sql`SELECT title FROM news_posts WHERE slug = ${art.slug} LIMIT 1`,
    )) as unknown as Array<{ title: string }>;
    if (slugRows.length > 0) {
      checks.push({ name: 'dedup', ok: false, detail: `slug '${art.slug}' already exists` });
    } else {
      const recent = (await db.execute(sql`
        SELECT title FROM news_posts
        WHERE published_at >= NOW() - INTERVAL '180 days'
        ORDER BY published_at DESC LIMIT 200
      `)) as unknown as Array<{ title: string }>;
      const near = recent.find((r) => jaccard(r.title, art.title) >= 0.6);
      checks.push(
        near
          ? { name: 'dedup', ok: false, detail: `near-duplicate of "${near.title}"` }
          : { name: 'dedup', ok: true },
      );
    }
  }

  // 5. slop-lint
  {
    const issues: string[] = [];
    const body = art.bodyMd ?? '';
    const lower = body.toLowerCase();
    if (body.length < BODY_MIN) issues.push(`body too short (${body.length}<${BODY_MIN})`);
    if (body.length > BODY_MAX) issues.push(`body too long (${body.length}>${BODY_MAX})`);
    if ((art.title ?? '').length > TITLE_MAX) issues.push('title >70 chars');
    if ((art.summary ?? '').length > SUMMARY_MAX) issues.push('summary >320 chars');
    if (/<\s*(script|iframe|style|on\w+=)/i.test(body)) issues.push('raw HTML/script in body');
    const hits = SLOP_PHRASES.filter((p) => lower.includes(p));
    if (hits.length > 0) issues.push(`AI-tells: ${hits.slice(0, 5).join(', ')}`);
    checks.push(
      issues.length === 0
        ? { name: 'slop-lint', ok: true }
        : { name: 'slop-lint', ok: false, detail: issues.join('; ') },
    );
  }

  // 6. links-valid
  checks.push(await checkLinks(art.internalLinks ?? []));

  return { passed: checks.every((c) => c.ok), checks };
}
