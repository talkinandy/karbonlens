// No ISR: auth-gated; server query is sub-ms on period_month index.
import type { Metadata } from 'next';
import { getPriceHistory } from '@/lib/queries/prices';
import { PriceChart } from '@/components/prices/PriceChart';
import { MonthlyTable } from '@/components/prices/MonthlyTable';
import { JsonLd } from '@/components/seo/JsonLd';

// T26 — page-level metadata. Short title → "Prices · KarbonLens".
export const metadata: Metadata = {
  title: 'Prices',
  description:
    'IDXCarbon monthly volume, value, and average price — last 10 months.',
  openGraph: {
    url: '/prices',
    title: 'Prices · KarbonLens',
    description:
      'IDXCarbon monthly volume, value, and average price — last 10 months.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: "KarbonLens — Indonesia's carbon market, in one terminal",
      },
    ],
  },
  twitter: {
    title: 'Prices · KarbonLens',
    description:
      'IDXCarbon monthly volume, value, and average price — last 10 months.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/prices' },
};

function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtVolumeK(val: string | null | undefined): string {
  if (val == null) return '—';
  const k = Number(val) / 1000;
  return k.toFixed(1) + 'k tCO₂e';
}

function fmtValueB(val: string | null | undefined): string {
  if (val == null) return '—';
  const b = Number(val) / 1_000_000_000;
  return 'Rp ' + b.toFixed(1) + 'B';
}

function fmtAvgPriceK(val: string | null | undefined): string {
  if (val == null) return '—';
  const k = Math.round(Number(val) / 1000);
  return 'Rp ' + k + 'k';
}

function momDelta(
  current: string | number | null | undefined,
  previous: string | number | null | undefined,
): { arrow: string; pct: string; positive: boolean } | null {
  if (current == null || previous == null) return null;
  const cur = Number(current);
  const prev = Number(previous);
  if (prev === 0) return null;
  const delta = ((cur - prev) / prev) * 100;
  if (Math.abs(delta) < 1) return null;
  return {
    arrow: delta >= 0 ? '↑' : '↓',
    pct: Math.abs(delta).toFixed(1) + '%',
    positive: delta >= 0,
  };
}

function DeltaBadge({ delta }: { delta: { arrow: string; pct: string; positive: boolean } | null }) {
  if (!delta) return null;
  return (
    <span
      style={{
        color: delta.positive ? 'var(--color-positive, #16a34a)' : 'var(--color-negative, #dc2626)',
        fontSize: '0.8rem',
        fontWeight: 500,
      }}
    >
      {delta.arrow} {delta.pct}
    </span>
  );
}

export default async function PricesPage() {
  let rows: Awaited<ReturnType<typeof getPriceHistory>>;
  try {
    rows = await getPriceHistory();
  } catch {
    return (
      <div className="kl-page">
        <p className="kl-section-label" style={{ color: 'var(--color-negative)' }}>
          Unable to load price data. Please try again later.
        </p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="kl-page">
        <p className="kl-section-label">
          No data yet — check back after IDXCarbon publishes the next monthly report.
        </p>
      </div>
    );
  }

  const latest = rows[0];
  const previous = rows.length > 1 ? rows[1] : null;
  const latestPeriod = formatPeriod(latest.periodMonth);

  const volumeDelta = previous ? momDelta(latest.totalVolumeTco2e, previous.totalVolumeTco2e) : null;
  const valueDelta = previous ? momDelta(latest.totalValueIdr, previous.totalValueIdr) : null;
  const priceDelta = previous ? momDelta(latest.avgPriceIdr, previous.avgPriceIdr) : null;
  const participantsDelta = previous
    ? momDelta(latest.registeredParticipants, previous.registeredParticipants)
    : null;

  const heroCards = [
    { label: 'Latest month', value: latestPeriod, delta: null as { arrow: string; pct: string; positive: boolean } | null },
    { label: 'Volume', value: fmtVolumeK(latest.totalVolumeTco2e), delta: volumeDelta },
    { label: 'Value', value: fmtValueB(latest.totalValueIdr), delta: valueDelta },
    { label: 'Avg price', value: fmtAvgPriceK(latest.avgPriceIdr), delta: priceDelta },
    { label: 'Participants', value: latest.registeredParticipants?.toLocaleString('en-US') ?? '—', delta: participantsDelta },
  ];

  // SEO Phase 2A — Dataset JSON-LD. Google's Dataset rich-result and the
  // LLM dataset crawlers consume this. Each monthly snapshot is exposed as
  // a DataDownload pointing at the corresponding /prices/[YYYY-MM] page.
  const oldest = rows[rows.length - 1];
  const datasetSchema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'IDXCarbon Monthly Price Snapshots — Indonesia',
    description:
      'Monthly volume, total value, and average price per tCO₂e for IDXCarbon, Indonesia\'s regulated carbon exchange. Derived from IDXCarbon\'s public monthly reports.',
    url: 'https://karbonlens.com/prices',
    identifier: 'karbonlens-idxcarbon-monthly',
    isAccessibleForFree: true,
    creator: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: 'https://karbonlens.com',
    },
    publisher: {
      '@type': 'Organization',
      name: 'KarbonLens',
      url: 'https://karbonlens.com',
    },
    spatialCoverage: {
      '@type': 'Place',
      name: 'Indonesia',
      address: { '@type': 'PostalAddress', addressCountry: 'ID' },
    },
    temporalCoverage: `${oldest.periodMonth.slice(0, 7)}/${latest.periodMonth.slice(0, 7)}`,
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Total volume', unitText: 'tCO2e' },
      { '@type': 'PropertyValue', name: 'Total value', unitText: 'IDR' },
      { '@type': 'PropertyValue', name: 'Average price', unitText: 'IDR/tCO2e' },
      { '@type': 'PropertyValue', name: 'Registered participants', unitText: 'count' },
    ],
    citation: 'Source: IDXCarbon monthly reports (idxcarbon.co.id/data-monthly)',
    license: 'https://karbonlens.com/terms',
    isPartOf: {
      '@type': 'DataCatalog',
      name: 'KarbonLens Indonesian Carbon Market Datasets',
      url: 'https://karbonlens.com',
    },
    dateModified: latest.periodMonth,
    distribution: rows.map((r) => ({
      '@type': 'DataDownload',
      name: `IDXCarbon ${formatPeriod(r.periodMonth)} snapshot`,
      contentUrl: `https://karbonlens.com/prices/${r.periodMonth.slice(0, 7)}`,
      encodingFormat: 'text/html',
    })),
  };

  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">IDXCarbon · {latestPeriod}</p>
          <h1 className="kl-page-title">Price intelligence</h1>
          <p className="kl-page-subtitle">
            Monthly IDXCarbon snapshots — last 10 months. Per-credit-type breakdown in v0.2.
          </p>
        </div>
      </header>

      {/* Hero stats */}
      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 32,
        }}
      >
        {heroCards.map((card) => (
          <div key={card.label} className="kl-card">
            <p className="kl-stat-label">{card.label}</p>
            <p className="kl-stat-value tnum">{card.value}</p>
            <DeltaBadge delta={card.delta} />
          </div>
        ))}
      </section>

      {/* Chart */}
      <section style={{ marginBottom: 32 }}>
        <PriceChart rows={rows} />
      </section>

      {/* Monthly detail table */}
      <section style={{ marginBottom: 24 }}>
        <p className="kl-section-label" style={{ marginBottom: 12 }}>Monthly detail</p>
        <MonthlyTable rows={rows} />
      </section>

      {/* Methodology note + source */}
      <p className="kl-page-subtitle">
        Data from IDXCarbon monthly reports. Source:{' '}
        <a href="https://idxcarbon.co.id/data-monthly" target="_blank" rel="noopener noreferrer">
          idxcarbon.co.id/data-monthly
        </a>
        . Reports typically published ~1 week after month-end. Historical coverage limited to
        IDXCarbon&apos;s current archive (10 months).
      </p>

      <JsonLd id="ld-prices-dataset" data={datasetSchema} />
    </main>
  );
}
