/**
 * lib/seo/autopilot/regulatory-gate.ts — regulatory extraction GATE (WS4).
 *
 * Regulatory events are NEW facts (regulatory_events IS the source of truth), so
 * there's no DB value to reverify against — the human review is the real gate.
 * This gate enforces structure + traceability so the reviewer only sees
 * well-formed, sourced candidates:
 *   1. events-valid   — each event has a valid date, title, and English summary.
 *   2. sources-valid  — each documentUrl is a real ingested carbon_news_items
 *                       row (so every event traces to a source we actually saw).
 *   3. dedup          — at least one event isn't already in regulatory_events.
 *   4. slop-lint      — summaries within length, no AI-tells / raw HTML.
 */

import { sql, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { carbonNewsItems } from '@/lib/schema';
import type { SeoJobQa } from '@/lib/schema';
import type { RegulatoryArtifact, RegulatoryEventDraft } from './types';

type Check = { name: string; ok: boolean; detail?: string };

const SUMMARY_MAX = 800;
const SLOP_PHRASES = [
  'in the ever-evolving', 'in conclusion', 'it is important to note',
  "it's important to note", 'delve into', 'a testament to', 'game-changer', 'rich tapestry',
];

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime());
}

export async function runRegulatoryGate(art: RegulatoryArtifact): Promise<SeoJobQa> {
  const checks: Check[] = [];
  const events: RegulatoryEventDraft[] = Array.isArray(art.events) ? art.events : [];

  // 1. events-valid
  {
    const bad: string[] = [];
    events.forEach((e, i) => {
      if (!e || !validDate(String(e.eventDate ?? ''))) bad.push(`#${i} bad eventDate`);
      else if (!e.title || !e.title.trim()) bad.push(`#${i} missing title`);
      else if (!e.summaryEn || !e.summaryEn.trim()) bad.push(`#${i} missing summaryEn`);
      else if (e.importance && !['high', 'medium', 'low'].includes(e.importance)) bad.push(`#${i} bad importance`);
    });
    checks.push(
      events.length === 0
        ? { name: 'events-valid', ok: false, detail: 'no events' }
        : bad.length > 0
          ? { name: 'events-valid', ok: false, detail: bad.slice(0, 5).join('; ') }
          : { name: 'events-valid', ok: true, detail: `${events.length} events` },
    );
  }

  // 2. sources-valid — every documentUrl is a real ingested item.
  const urls = Array.from(new Set(events.map((e) => (e?.documentUrl ?? '').trim()).filter(Boolean)));
  let ingested = new Set<string>();
  if (urls.length > 0) {
    const rows = (await db
      .select({ url: carbonNewsItems.url })
      .from(carbonNewsItems)
      .where(inArray(carbonNewsItems.url, urls))) as Array<{ url: string }>;
    ingested = new Set(rows.map((r) => r.url));
  }
  {
    const missing = events
      .map((e) => (e?.documentUrl ?? '').trim())
      .filter((u) => !u || !ingested.has(u));
    checks.push(
      missing.length === 0 && events.length > 0
        ? { name: 'sources-valid', ok: true, detail: `${urls.length} sources verified` }
        : { name: 'sources-valid', ok: false, detail: `untraceable documentUrl(s): ${missing.slice(0, 3).join(', ') || 'missing'}` },
    );
  }

  // 3. dedup — at least one event is genuinely new.
  {
    let newCount = 0;
    for (const e of events) {
      const num = (e?.documentNumber ?? '').trim();
      const rows = (await db.execute(sql`
        SELECT 1 FROM regulatory_events
        WHERE (${num} <> '' AND lower(document_number) = lower(${num}))
           OR lower(title) = lower(${e?.title ?? ''})
        LIMIT 1
      `)) as unknown as unknown[];
      if (rows.length === 0) newCount += 1;
    }
    checks.push(
      newCount > 0
        ? { name: 'dedup', ok: true, detail: `${newCount} new` }
        : { name: 'dedup', ok: false, detail: 'all events already in regulatory_events' },
    );
  }

  // 4. slop-lint
  {
    const issues: string[] = [];
    for (const e of events) {
      const s = e?.summaryEn ?? '';
      if (s.length > SUMMARY_MAX) issues.push(`summary >${SUMMARY_MAX} chars`);
      if (/<\s*(script|iframe|style|on\w+=)/i.test(s)) issues.push('raw HTML in summary');
      const hit = SLOP_PHRASES.find((p) => s.toLowerCase().includes(p));
      if (hit) issues.push(`AI-tell: ${hit}`);
    }
    checks.push(
      issues.length === 0 ? { name: 'slop-lint', ok: true } : { name: 'slop-lint', ok: false, detail: Array.from(new Set(issues)).slice(0, 4).join('; ') },
    );
  }

  return { passed: checks.every((c) => c.ok), checks };
}
