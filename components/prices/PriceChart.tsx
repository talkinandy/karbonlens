'use client';

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { PriceRow } from '@/lib/queries/prices';
import { ChartA11yTable } from './ChartA11yTable';

interface ChartDataPoint {
  label: string;
  avgPrice: number | null;
  volume: number | null;
}

function formatXLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  const yr = String(d.getUTCFullYear()).slice(2);
  return `${mon} '${yr}`;
}

function formatPeriodFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function periodRange(rows: PriceRow[]): string {
  if (rows.length === 0) return '';
  // rows is DESC; oldest is last
  const oldest = formatPeriodFull(rows[rows.length - 1].periodMonth);
  const newest = formatPeriodFull(rows[0].periodMonth);
  return `${oldest} – ${newest}`;
}

interface PriceChartProps {
  rows: PriceRow[];
}

export function PriceChart({ rows }: PriceChartProps) {
  // Reverse so oldest is left on X-axis
  const chronological = [...rows].reverse();

  const data: ChartDataPoint[] = chronological.map((row) => ({
    label: formatXLabel(row.periodMonth),
    avgPrice: row.avgPriceIdr != null ? Number(row.avgPriceIdr) : null,
    volume: row.totalVolumeTco2e != null ? Number(row.totalVolumeTco2e) : null,
  }));

  const range = periodRange(rows);

  return (
    <>
      <figure aria-label={`Monthly IDXCarbon price and volume — ${range}`}>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #e5e7eb)" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              yAxisId="price"
              orientation="left"
              domain={[0, 'auto']}
              label={{ value: 'IDR per tCO₂e', angle: -90, position: 'insideLeft', offset: 12, style: { fontSize: 11 } }}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              yAxisId="volume"
              orientation="right"
              domain={[0, 'auto']}
              label={{ value: 'Volume tCO₂e', angle: 90, position: 'insideRight', offset: 12, style: { fontSize: 11 } }}
              tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(value: number, name: string) => {
                if (name === 'avgPrice') return [`Rp ${value.toLocaleString('en-US')}`, 'Avg price'];
                if (name === 'volume') return [value.toLocaleString('en-US') + ' tCO₂e', 'Volume'];
                return [value, name];
              }}
            />
            <Legend formatter={(value: string) => (value === 'avgPrice' ? 'Avg price (IDR/tCO₂e)' : 'Volume (tCO₂e)')} />
            <Bar yAxisId="volume" dataKey="volume" fill="var(--color-accent, #6366f1)" opacity={0.4} name="volume" />
            <Line
              yAxisId="price"
              type="monotone"
              dataKey="avgPrice"
              stroke="var(--color-positive, #16a34a)"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls={false}
              name="avgPrice"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </figure>
      <div className="sr-only">
        <ChartA11yTable rows={rows} />
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--color-muted, #6b7280)', marginTop: 8 }}>
        Historical coverage limited to IDXCarbon&apos;s 10-month archive.
      </p>
    </>
  );
}
