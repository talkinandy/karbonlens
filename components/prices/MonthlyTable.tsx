import type { PriceRow } from '@/lib/queries/prices';

function formatPeriod(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function fmtInt(val: string | null | undefined): string {
  if (val == null) return '—';
  return Number(val).toLocaleString('en-US');
}

function fmtAvgPriceFull(val: string | null | undefined): string {
  if (val == null) return '—';
  const n = Number(val);
  return 'Rp ' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

function fmtValueB(val: string | null | undefined): string {
  if (val == null) return '—';
  const b = Number(val) / 1_000_000_000;
  return 'Rp ' + b.toFixed(1) + 'B';
}

interface MonthlyTableProps {
  rows: PriceRow[];
}

export function MonthlyTable({ rows }: MonthlyTableProps) {
  return (
    <div className="kl-card" style={{ padding: 0, overflow: 'hidden' }}>
      <table className="kl-table">
        <thead>
          <tr>
            <th>Period</th>
            <th style={{ textAlign: 'right' }}>Volume (tCO₂e)</th>
            <th style={{ textAlign: 'right' }}>Value (Rp B)</th>
            <th style={{ textAlign: 'right' }}>Avg price (Rp)</th>
            <th style={{ textAlign: 'right' }}>Participants</th>
            <th style={{ textAlign: 'right' }}>Trading days</th>
            <th style={{ textAlign: 'right' }}>Available units</th>
            <th style={{ textAlign: 'right' }}>Retired units</th>
            <th>Report</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.periodMonth}>
              <td>{formatPeriod(row.periodMonth)}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{fmtInt(row.totalVolumeTco2e)}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{fmtValueB(row.totalValueIdr)}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{fmtAvgPriceFull(row.avgPriceIdr)}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{row.registeredParticipants ?? '—'}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{row.tradingDays ?? '—'}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{fmtInt(row.availableUnits)}</td>
              <td style={{ textAlign: 'right' }} className="tnum">{fmtInt(row.retiredUnits)}</td>
              <td>
                {row.rawReportUrl ? (
                  <a href={row.rawReportUrl} target="_blank" rel="noopener noreferrer">
                    PDF ↗
                  </a>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
