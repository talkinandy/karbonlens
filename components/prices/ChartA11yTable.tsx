import type { PriceRow } from '@/lib/queries/prices';

function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtInt(val: string | null | undefined): string {
  if (val == null) return '—';
  return Number(val).toLocaleString('en-US');
}

function fmtAvgPrice(val: string | null | undefined): string {
  if (val == null) return '—';
  const n = Number(val);
  return 'Rp ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtValueB(val: string | null | undefined): string {
  if (val == null) return '—';
  const b = Number(val) / 1_000_000_000;
  return 'Rp ' + b.toFixed(1) + 'B';
}

interface ChartA11yTableProps {
  rows: PriceRow[];
}

export function ChartA11yTable({ rows }: ChartA11yTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th scope="col">Period</th>
          <th scope="col">Volume (tCO₂e)</th>
          <th scope="col">Value (Rp B)</th>
          <th scope="col">Avg price (Rp)</th>
          <th scope="col">Participants</th>
          <th scope="col">Trading days</th>
          <th scope="col">Available units</th>
          <th scope="col">Retired units</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.periodMonth}>
            <td>{formatPeriod(row.periodMonth)}</td>
            <td>{fmtInt(row.totalVolumeTco2e)}</td>
            <td>{fmtValueB(row.totalValueIdr)}</td>
            <td>{fmtAvgPrice(row.avgPriceIdr)}</td>
            <td>{row.registeredParticipants ?? '—'}</td>
            <td>{row.tradingDays ?? '—'}</td>
            <td>{fmtInt(row.availableUnits)}</td>
            <td>{fmtInt(row.retiredUnits)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
