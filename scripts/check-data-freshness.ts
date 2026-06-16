/**
 * scripts/check-data-freshness.ts — data-freshness monitor + alerting.
 *
 * Nothing previously told us when a scraper silently stopped (e.g. /prices sat
 * on April). This checks the recency of every live dataset against its expected
 * cadence and, when one goes stale, emails ADMIN_EMAILS via Resend. Always logs
 * one JSON summary line so the cron log stays jq-friendly.
 *
 * Run with: ./node_modules/.bin/tsx scripts/check-data-freshness.ts
 */

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { sendEmail, isEmailConfigured } from '@/lib/email/resend';

type Dataset = {
  key: string;
  label: string;
  /** Hours after which it's considered stale. */
  maxHours: number;
  /** false = informational only (reported, never alerts). */
  alert: boolean;
};

// Thresholds = cadence + grace. Tune freely.
const DATASETS: Dataset[] = [
  { key: 'idx_prices', label: 'IDXCarbon prices (scrape)', maxHours: 24 * 8, alert: true },
  { key: 'projects', label: 'Projects / Verra (updated)', maxHours: 24 * 8, alert: true },
  { key: 'satellite_alerts', label: 'Satellite alerts / GFW', maxHours: 24 * 8, alert: true },
  { key: 'seo_keyword_ranks', label: 'SEO rankings / GSC', maxHours: 24 * 2, alert: true },
  { key: 'carbon_news_items', label: 'Carbon news ingest', maxHours: 24 * 1.5, alert: true },
  // Seed-only until regulatory automation lands — informational for now.
  { key: 'regulatory_events', label: 'Regulatory events', maxHours: 24 * 90, alert: true },
  { key: 'news_posts', label: 'News posts (published)', maxHours: 0, alert: false },
];

async function ageHours(): Promise<Record<string, number | null>> {
  const rows = (await db.execute(sql`
    SELECT 'idx_prices' AS key, EXTRACT(EPOCH FROM (now() - max(scraped_at))) / 3600 AS hours FROM idx_monthly_snapshots
    UNION ALL SELECT 'projects', EXTRACT(EPOCH FROM (now() - max(updated_at))) / 3600 FROM projects
    UNION ALL SELECT 'satellite_alerts', EXTRACT(EPOCH FROM (now() - max(ingested_at))) / 3600 FROM satellite_alerts
    UNION ALL SELECT 'seo_keyword_ranks', EXTRACT(EPOCH FROM (now() - max(observed_date))) / 3600 FROM seo_keyword_ranks
    UNION ALL SELECT 'carbon_news_items', EXTRACT(EPOCH FROM (now() - max(fetched_at))) / 3600 FROM carbon_news_items
    UNION ALL SELECT 'regulatory_events', EXTRACT(EPOCH FROM (now() - max(created_at))) / 3600 FROM regulatory_events
    UNION ALL SELECT 'news_posts', EXTRACT(EPOCH FROM (now() - max(published_at))) / 3600 FROM news_posts
  `)) as unknown as Array<{ key: string; hours: string | number | null }>;
  const out: Record<string, number | null> = {};
  for (const r of rows) out[r.key] = r.hours === null ? null : Math.round(Number(r.hours) * 10) / 10;
  return out;
}

async function main(): Promise<void> {
  let ages: Record<string, number | null>;
  try {
    ages = await ageHours();
  } catch (e) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'freshness_crash', error: e instanceof Error ? e.message : String(e) }));
    process.exitCode = 1;
    return;
  }

  const report = DATASETS.map((d) => {
    const h = ages[d.key] ?? null;
    const stale = d.alert && (h === null || h > d.maxHours);
    return { key: d.key, label: d.label, ageHours: h, maxHours: d.maxHours, alert: d.alert, stale };
  });
  const stale = report.filter((r) => r.stale);

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    event: stale.length > 0 ? 'freshness_stale' : 'freshness_ok',
    staleCount: stale.length,
    datasets: report.map((r) => ({ key: r.key, ageHours: r.ageHours, stale: r.stale })),
  }));

  if (stale.length === 0) return;

  if (!isEmailConfigured()) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'freshness_alert_skipped', reason: 'email not configured' }));
    return;
  }
  const to = (process.env.ADMIN_EMAILS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (to.length === 0) {
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: 'freshness_alert_skipped', reason: 'ADMIN_EMAILS empty' }));
    return;
  }

  const fmt = (h: number | null) => (h === null ? 'no rows' : `${(h / 24).toFixed(1)}d old`);
  const lines = stale.map((r) => `• ${r.label}: ${fmt(r.ageHours)} (limit ${(r.maxHours / 24).toFixed(0)}d)`);
  const text = `KarbonLens data-freshness alert — ${stale.length} dataset(s) stale:\n\n${lines.join('\n')}\n\nCheck the relevant scraper logs under /var/log/karbonlens/.`;
  const html = `<h2>KarbonLens data-freshness alert</h2><p>${stale.length} dataset(s) stale:</p><ul>${stale.map((r) => `<li><b>${r.label}</b>: ${fmt(r.ageHours)} (limit ${(r.maxHours / 24).toFixed(0)}d)</li>`).join('')}</ul><p>Check the scraper logs under <code>/var/log/karbonlens/</code>.</p>`;
  const res = await sendEmail({ to, subject: `⚠️ KarbonLens: ${stale.length} dataset(s) stale`, text, html });
  console.log(JSON.stringify({ ts: new Date().toISOString(), event: res.ok ? 'freshness_alert_sent' : 'freshness_alert_failed', detail: res.ok ? res.id : res.error }));
}

void main();
