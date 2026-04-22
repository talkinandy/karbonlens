/**
 * components/landing/Ticker.tsx — T25 landing ticker bar.
 *
 * Six live data items rendered as a 6-column grid (collapses to 3-col at
 * <=1100 px and 2-col at <=640 px via lp-ticker-inner media queries). Values
 * are server-fetched from `getLandingStats()`; deltas are rendered via the
 * lp-ti-delta.{up|down|flat} modifier classes.
 *
 * Per T25 §3.2. Time-frames: rows 1-3 are monthly (MoM); row 4 is weekly
 * (WoW); rows 5-6 are flat (no prior window available).
 *
 * Items never render `null` — the `fallback` prop for each item collapses
 * to an em-dash.
 */

import type { LandingStats } from '@/lib/queries/landing-stats';

type Tone = 'up' | 'down' | 'flat';

function dash(v: string | null | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : v;
}

function signedPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function signedInt(n: number): string {
  const rounded = Math.round(n);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded.toLocaleString('en-US')}`;
}

function tco2eDelta(n: number): string {
  const abs = Math.abs(n);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  if (abs >= 1_000_000) {
    return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M tCO₂e`;
  }
  if (abs >= 1_000) {
    return `${sign}${Math.round(abs / 1_000).toLocaleString('en-US')}k tCO₂e`;
  }
  return `${sign}${abs.toLocaleString('en-US')} tCO₂e`;
}

function toneFor(n: number): Tone {
  if (n > 0) return 'up';
  if (n < 0) return 'down';
  return 'flat';
}

type TickerItemProps = {
  label: string;
  value: string;
  delta: string;
  tone: Tone;
};

function TickerItem({ label, value, delta, tone }: TickerItemProps) {
  return (
    <div className="lp-ticker-item">
      <div className="lp-ti-label">{label}</div>
      <div className="lp-ti-value">{value}</div>
      <div className={`lp-ti-delta ${tone}`}>{delta}</div>
    </div>
  );
}

export function Ticker({ stats }: { stats: LandingStats }) {
  // Item 1 — IDXCarbon avg price (MoM %)
  const priceValue = dash(stats.latestAvgPriceIdr);
  const priceDelta =
    stats.momDeltaPct === null ? 'flat' : signedPct(stats.momDeltaPct);
  const priceTone: Tone =
    stats.momDeltaPct === null ? 'flat' : toneFor(stats.momDeltaPct);

  // Item 2 — latest-month volume (MoM abs)
  const monthLabel = stats.latestPeriod
    ? `${stats.latestPeriod.split(' ')[0]} volume`
    : 'Latest volume';
  const volumeValue = dash(stats.latestVolumeTco2e);
  const volumeDelta =
    stats.momVolumeDelta === null ? 'flat' : tco2eDelta(stats.momVolumeDelta);
  const volumeTone: Tone =
    stats.momVolumeDelta === null ? 'flat' : toneFor(stats.momVolumeDelta);

  // Item 3 — participants (MoM abs)
  const partValue =
    stats.idxParticipantCount === null
      ? '—'
      : stats.idxParticipantCount.toLocaleString('en-US');
  const partDelta =
    stats.momParticipantDelta === null
      ? 'flat'
      : signedInt(stats.momParticipantDelta);
  const partTone: Tone =
    stats.momParticipantDelta === null
      ? 'flat'
      : toneFor(stats.momParticipantDelta);

  // Item 4 — active alerts (last 30d) + WoW (last 7d vs prior 7d)
  const alertsValue = stats.activeAlerts30d.toLocaleString('en-US');
  const wowDelta = stats.alerts7d - stats.alertsPrior7d;
  const alertsDelta = `${signedInt(wowDelta)} WoW`;
  const alertsTone: Tone = toneFor(wowDelta);

  // Item 5 — median integrity score (flat)
  const scoreValue =
    stats.medianIntegrityScore === null
      ? '—'
      : String(stats.medianIntegrityScore);

  // Item 6 — regulatory events (flat)
  const regValue = stats.regulatoryEventCount.toLocaleString('en-US');

  return (
    <section className="lp-ticker" aria-label="Live market ticker">
      <div className="lp-ticker-inner">
        <TickerItem
          label={`IDTBS-RE${stats.latestPeriod ? ' · ' + stats.latestPeriod : ''}`}
          value={priceValue}
          delta={priceDelta}
          tone={priceTone}
        />
        <TickerItem
          label={monthLabel}
          value={volumeValue}
          delta={volumeDelta}
          tone={volumeTone}
        />
        <TickerItem
          label="Participants"
          value={partValue}
          delta={partDelta}
          tone={partTone}
        />
        <TickerItem
          label="Active alerts · 30d"
          value={alertsValue}
          delta={alertsDelta}
          tone={alertsTone}
        />
        <TickerItem
          label="Median integrity"
          value={scoreValue}
          delta="flat"
          tone="flat"
        />
        <TickerItem
          label="Regulatory tracked"
          value={regValue}
          delta="flat"
          tone="flat"
        />
      </div>
    </section>
  );
}
