/**
 * app/(app)/prices/[month]/page.tsx — per-month IDXCarbon snapshot detail (T32, Phase 3).
 *
 * Renders one row of `idx_monthly_snapshots` keyed by `YYYY-MM` slug. Mirrors
 * the answer-first + indexable + LLM-extractable shape of the regulatory
 * detail page: TL;DR card, Key Facts <dl>, FAQ block, prior/next nav, and
 * three JSON-LD payloads (Article + BreadcrumbList + Dataset + FAQPage).
 *
 * The list view at /prices already covers chart/table for "all months". This
 * route is the deep link surface — one URL per month, indexable by crawlers,
 * extractable by LLM-based answer engines.
 *
 * Styling reuses globals.css classes (`kl-desc-facts`, `kl-desc-faq`) and
 * `.kl-reg-tldr`-style inline patterns from the regulatory detail page; this
 * file does not edit globals.css.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import { JsonLd } from '@/components/seo/JsonLd';

const BASE = 'https://karbonlens.com';

const SLUG_RE = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

type Snapshot = Record<string, unknown>;

async function getMonthSnapshot(slug: string): Promise<{ row: Snapshot; prior: Snapshot | null } | null> {
  if (!SLUG_RE.test(slug)) return null;
  const periodMonth = `${slug}-01`;

  try {
    const rows = (await db.execute(sql`
      SELECT *
      FROM idx_monthly_snapshots
      WHERE period_month = ${periodMonth}::date
      LIMIT 1
    `)) as unknown as Snapshot[];
    const row = rows[0];
    if (!row) return null;

    const prior = (await db.execute(sql`
      SELECT * FROM idx_monthly_snapshots
      WHERE period_month < ${periodMonth}::date
      ORDER BY period_month DESC LIMIT 1
    `)) as unknown as Snapshot[];

    return { row, prior: prior[0] ?? null };
  } catch {
    return null;
  }
}

async function hasMonth(slug: string): Promise<boolean> {
  if (!SLUG_RE.test(slug)) return false;
  const periodMonth = `${slug}-01`;
  try {
    const rows = (await db.execute(sql`
      SELECT 1 AS one
      FROM idx_monthly_snapshots
      WHERE period_month = ${periodMonth}::date
      LIMIT 1
    `)) as unknown as { one: number }[];
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ─── Slug + date helpers ─────────────────────────────────────────────────────

function monthLabel(slug: string): string {
  // slug is YYYY-MM; build a UTC date and format in en-US.
  return new Date(`${slug}-01T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function shiftMonth(slug: string, delta: number): string {
  const [yStr, mStr] = slug.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  // 1-indexed month; convert to 0-indexed for arithmetic, then back.
  const total = (y * 12 + (m - 1)) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${String(ny).padStart(4, '0')}-${String(nm).padStart(2, '0')}`;
}

function lastDayOfMonth(slug: string): string {
  const [yStr, mStr] = slug.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  // Day 0 of next month = last day of current month, in UTC.
  const d = new Date(Date.UTC(y, m, 0));
  return `${slug}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function firstDayOfNextMonth(slug: string): string {
  return `${shiftMonth(slug, 1)}-01`;
}

// ─── Value helpers ───────────────────────────────────────────────────────────

function num(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'bigint') return Number(v);
  return null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  return String(v);
}

function fmtInt(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtVolumeTco2e(n: number | null): string {
  if (n == null) return '—';
  return `${fmtInt(Math.round(n))} tCO₂e`;
}

function fmtIdrBn(n: number | null): string {
  if (n == null) return '—';
  return `Rp ${(n / 1e9).toFixed(1)} bn`;
}

function fmtIdrFull(n: number | null): string {
  if (n == null) return '—';
  return `Rp ${fmtInt(Math.round(n))}`;
}

function fmtAvgPrice(n: number | null): string {
  if (n == null) return '—';
  return `Rp ${fmtInt(Math.round(n))}/tCO₂e`;
}

function pctDelta(curr: number | null, prev: number | null): string | null {
  if (curr == null || prev == null || prev === 0) return null;
  const delta = ((curr - prev) / prev) * 100;
  if (!Number.isFinite(delta)) return null;
  const sign = delta >= 0 ? '+' : '−';
  return `${sign}${Math.abs(delta).toFixed(1)}%`;
}

function isoDate(v: unknown): string | null {
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  // Accept ISO timestamps or YYYY-MM-DD strings.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ─── Metadata ────────────────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ month: string }>;
}): Promise<Metadata> {
  const { month } = await params;
  const data = await getMonthSnapshot(month);
  if (!data) return {};
  const label = monthLabel(month);
  const volume = num(data.row.total_volume_tco2e);
  const avgPrice = num(data.row.avg_price_idr);
  const volumeTxt = volume != null ? fmtInt(Math.round(volume)) : '—';
  const priceTxt = avgPrice != null ? fmtInt(Math.round(avgPrice)) : '—';
  const description = `Indonesia's IDXCarbon exchange cleared ${volumeTxt} tCO₂e at avg Rp ${priceTxt}/tCO₂e in ${label}. Monthly snapshot with volume, value, transactions, and source PDF link.`;

  return {
    title: `IDXCarbon ${label} — Indonesian carbon market price and volume`,
    description,
    openGraph: {
      title: `IDXCarbon ${label}`,
      description,
      url: `/prices/${month}`,
      type: 'article',
    },
    alternates: { canonical: `/prices/${month}` },
  };
}

// ─── Static params ───────────────────────────────────────────────────────────

export async function generateStaticParams() {
  try {
    const rows = (await db.execute(sql`
      SELECT TO_CHAR(period_month, 'YYYY-MM') AS slug FROM idx_monthly_snapshots
    `)) as unknown as { slug: string }[];
    return rows.map((r) => ({ month: r.slug }));
  } catch {
    return [];
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function MonthlyPricePage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = await params;
  const data = await getMonthSnapshot(month);
  if (!data) notFound();
  const { row, prior } = data;

  const label = monthLabel(month);

  // Pull + coerce values.
  const volume = num(row.total_volume_tco2e);
  const totalValue = num(row.total_value_idr);
  const avgPrice = num(row.avg_price_idr);
  const totalTransactions = num(row.total_transactions);
  const tradingDays = num(row.trading_days);
  const availableUnits = num(row.available_units);
  const retiredUnits = num(row.retired_units);
  const participants = num(row.registered_participants);
  const projects = num(row.registered_projects);
  const rawReportUrl = str(row.raw_report_url);
  const scrapedAtIso = isoDate(row.scraped_at);

  const priorVolume = prior ? num(prior.total_volume_tco2e) : null;
  const priorPrice = prior ? num(prior.avg_price_idr) : null;
  const volumeMom = pctDelta(volume, priorVolume);
  const priceMom = pctDelta(avgPrice, priorPrice);

  // Prior + next month nav.
  const priorSlug = shiftMonth(month, -1);
  const nextSlug = shiftMonth(month, 1);
  const nextExists = await hasMonth(nextSlug);
  // Prior link is unconditional per spec ("always renders if row exists").

  // ── TL;DR copy ─────────────────────────────────────────────────────────────
  const volumeTxt = fmtVolumeTco2e(volume);
  const valueTxt = fmtIdrBn(totalValue);
  const avgTxt = fmtAvgPrice(avgPrice);
  const txTxt = fmtInt(totalTransactions);
  const daysTxt = fmtInt(tradingDays);
  const momVolFrag = volumeMom ? ` (${volumeMom} MoM)` : '';
  const momPriceFrag = priceMom ? ` (${priceMom} MoM)` : '';
  const tldr = `In ${label} Indonesia's IDXCarbon exchange cleared ${volumeTxt}${momVolFrag} at an average price of ${avgTxt}${momPriceFrag}. Total traded value: ${valueTxt} across ${txTxt} transactions on ${daysTxt} trading days.`;

  // ── FAQ copy ───────────────────────────────────────────────────────────────
  const faqs = [
    {
      q: 'What is IDXCarbon?',
      a: "IDXCarbon is Indonesia's domestic carbon exchange, operated by the Indonesia Stock Exchange (IDX). It trades SPE-GRK units and imported Verra VCS credits under Indonesia's 2025 regulatory framework (Perpres 110/2025).",
    },
    {
      q: `How much carbon traded in ${label}?`,
      a: `${volumeTxt} cleared at a total traded value of ${valueTxt}, across ${txTxt} transactions.`,
    },
    {
      q: 'What was the average price?',
      a: priceMom
        ? `${avgTxt} (${priceMom} month-on-month).`
        : `${avgTxt}.`,
    },
    {
      q: 'Where does this data come from?',
      a: `KarbonLens scrapes IDXCarbon's monthly public PDF reports. Raw source: ${rawReportUrl ?? 'idxcarbon.co.id'}. Updated monthly.`,
    },
  ];

  // ── JSON-LD ────────────────────────────────────────────────────────────────
  const datePublished = firstDayOfNextMonth(month);
  const dateModified = scrapedAtIso ?? datePublished;
  const headline = `IDXCarbon monthly report — ${label}`;

  const articleSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    datePublished,
    dateModified,
    author: { '@type': 'Organization', name: 'KarbonLens' },
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: BASE,
      logo: {
        '@type': 'ImageObject',
        url: `${BASE}/brand/karbonlens-mark.svg`,
      },
    },
    about: { '@type': 'Thing', name: 'IDXCarbon' },
    inLanguage: 'en',
    url: `${BASE}/prices/${month}`,
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${BASE}/` },
      { '@type': 'ListItem', position: 2, name: 'Prices', item: `${BASE}/prices` },
      { '@type': 'ListItem', position: 3, name: label, item: `${BASE}/prices/${month}` },
    ],
  };

  type Variable = {
    '@type': 'PropertyValue';
    name: string;
    value: number;
    unitText?: string;
  };
  const variables: Variable[] = [
    volume != null
      ? { '@type': 'PropertyValue' as const, name: 'Volume traded', value: volume, unitText: 'tCO2e' }
      : null,
    avgPrice != null
      ? { '@type': 'PropertyValue' as const, name: 'Average price', value: avgPrice, unitText: 'IDR per tCO2e' }
      : null,
    totalValue != null
      ? { '@type': 'PropertyValue' as const, name: 'Total value', value: totalValue, unitText: 'IDR' }
      : null,
    totalTransactions != null
      ? { '@type': 'PropertyValue' as const, name: 'Transactions', value: totalTransactions }
      : null,
  ].filter((v): v is Variable => v !== null);

  const datasetSchema: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `IDXCarbon ${label} snapshot`,
    description: `Monthly statistical snapshot of Indonesia's IDXCarbon exchange for ${label}: volume traded, average price, total value, transaction count, and trading days.`,
    creator: { '@type': 'Organization', name: 'KarbonLens' },
    temporalCoverage: `${month}-01/${lastDayOfMonth(month)}`,
    spatialCoverage: { '@type': 'Country', name: 'Indonesia' },
    variableMeasured: variables,
    dateModified,
  };
  if (rawReportUrl) {
    datasetSchema.distribution = [
      {
        '@type': 'DataDownload',
        contentUrl: rawReportUrl,
        encodingFormat: 'application/pdf',
      },
    ];
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="kl-page">
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <p className="kl-section-label" style={{ marginBottom: 8 }}>
          <Link
            href="/prices"
            style={{ color: 'var(--text-3)', textDecoration: 'none' }}
          >
            ← All months
          </Link>
        </p>

        <header style={{ marginBottom: 20 }}>
          <p className="kl-section-label" style={{ marginBottom: 8 }}>
            IDXCARBON · {label}
          </p>
          <h1 className="kl-page-title" style={{ marginBottom: 8 }}>
            {headline}
          </h1>
        </header>

        {/* TL;DR card — same visual pattern as kl-reg-tldr on the regulatory detail page */}
        <section
          className="kl-reg-tldr"
          style={{
            border: '0.5px solid var(--border)',
            borderLeft: '4px solid var(--info-fg)',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '18px 20px',
            marginBottom: 28,
            background: 'var(--surface, transparent)',
          }}
        >
          <p className="kl-section-label" style={{ marginBottom: 8 }}>
            TL;DR
          </p>
          <p
            style={{
              fontFamily: 'var(--font-instrument-serif), Georgia, serif',
              fontSize: 18,
              lineHeight: 1.5,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            {tldr}
          </p>
        </section>

        {/* Key Facts */}
        <section style={{ marginBottom: 28 }}>
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            Key facts
          </p>
          <dl className="kl-desc-facts">
            <dt>Month</dt>
            <dd>{label}</dd>

            {volume != null ? (
              <>
                <dt>Total volume</dt>
                <dd>{fmtVolumeTco2e(volume)}</dd>
              </>
            ) : null}

            {totalValue != null && totalValue !== 0 ? (
              <>
                <dt>Total value</dt>
                <dd>{fmtIdrFull(totalValue)}</dd>
              </>
            ) : null}

            {avgPrice != null && avgPrice !== 0 ? (
              <>
                <dt>Avg price</dt>
                <dd>{fmtAvgPrice(avgPrice)}</dd>
              </>
            ) : null}

            {totalTransactions != null && totalTransactions !== 0 ? (
              <>
                <dt>Transactions</dt>
                <dd>{fmtInt(totalTransactions)}</dd>
              </>
            ) : null}

            {tradingDays != null && tradingDays !== 0 ? (
              <>
                <dt>Trading days</dt>
                <dd>{fmtInt(tradingDays)}</dd>
              </>
            ) : null}

            {availableUnits != null && availableUnits !== 0 ? (
              <>
                <dt>Available units</dt>
                <dd>{fmtInt(availableUnits)}</dd>
              </>
            ) : null}

            {retiredUnits != null && retiredUnits !== 0 ? (
              <>
                <dt>Retired units</dt>
                <dd>{fmtInt(retiredUnits)}</dd>
              </>
            ) : null}

            {participants != null && participants !== 0 ? (
              <>
                <dt>Registered participants</dt>
                <dd>{fmtInt(participants)}</dd>
              </>
            ) : null}

            {projects != null && projects !== 0 ? (
              <>
                <dt>Registered projects</dt>
                <dd>{fmtInt(projects)}</dd>
              </>
            ) : null}

            {rawReportUrl ? (
              <>
                <dt>Source PDF</dt>
                <dd style={{ overflowWrap: 'anywhere' }}>
                  <a
                    href={rawReportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--info-fg)' }}
                  >
                    IDXCarbon official PDF
                  </a>
                </dd>
              </>
            ) : null}

            {scrapedAtIso ? (
              <>
                <dt>Data scraped</dt>
                <dd>
                  <time dateTime={scrapedAtIso}>{scrapedAtIso}</time>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        {/* FAQ */}
        <section className="kl-desc-faq">
          <p className="kl-section-label" style={{ marginBottom: 12 }}>
            FAQ
          </p>
          {faqs.map((f) => (
            <div key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
        </section>

        {/* Prior + next month nav */}
        <nav
          aria-label="Adjacent months"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            marginTop: 32,
            paddingTop: 16,
            borderTop: '0.5px solid var(--border)',
            fontSize: 13,
          }}
        >
          <Link
            href={`/prices/${priorSlug}`}
            style={{ color: 'var(--text-3)', textDecoration: 'none' }}
          >
            ← {monthLabel(priorSlug)}
          </Link>
          {nextExists ? (
            <Link
              href={`/prices/${nextSlug}`}
              style={{ color: 'var(--text-3)', textDecoration: 'none' }}
            >
              {monthLabel(nextSlug)} →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </article>

      <JsonLd data={articleSchema} id="ld-article" />
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <JsonLd data={datasetSchema} id="ld-dataset" />
      <JsonLd data={faqSchema} id="ld-faq" />
    </main>
  );
}
