/**
 * components/landing/StatCard.tsx — T18 landing hero stat card.
 *
 * Pure presentational server component. `null` values render as "—" so the
 * page never shows blanks even when `getLandingStats` hits the DB-down
 * fallback path. Trend badge is optional and uses the existing positive /
 * negative semantic colors (matching T14's MoM delta pattern).
 */

export type StatCardProps = {
  label: string;
  value: string | number | null;
  sublabel?: string | null;
  trend?: { pct: number } | null;
};

// Env-independent thousands grouping. Matches the helper in
// `lib/queries/landing-stats.ts` — see the rationale there.
function formatNumber(n: number): string {
  const rounded = Math.round(n);
  const s = String(Math.abs(rounded));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rounded < 0 ? `-${grouped}` : grouped;
}

export function StatCard({ label, value, sublabel, trend }: StatCardProps) {
  const display =
    value === null || value === undefined || value === ''
      ? '—'
      : typeof value === 'number'
        ? formatNumber(value)
        : value;

  return (
    <div className="kl-card">
      <p className="kl-stat-label">{label}</p>
      <p className="kl-stat-value tnum">{display}</p>
      {sublabel || trend ? (
        <p className="kl-stat-delta" style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          {sublabel ? <span>{sublabel}</span> : null}
          {trend ? <TrendBadge pct={trend.pct} /> : null}
        </p>
      ) : null}
    </div>
  );
}

function TrendBadge({ pct }: { pct: number }) {
  if (!Number.isFinite(pct)) return null;
  const arrow = pct >= 0 ? '↑' : '↓';
  const color = pct >= 0 ? 'var(--success-fg)' : 'var(--danger-fg)';
  const abs = Math.abs(pct).toFixed(1).replace(/\.0$/, '');
  return (
    <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>
      {arrow} {abs}% MoM
    </span>
  );
}
