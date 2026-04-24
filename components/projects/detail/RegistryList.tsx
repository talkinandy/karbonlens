/**
 * RegistryList — registry cross-reference card (#registries anchor).
 *
 * Columns: Registry | External ID | Status | Last synced. External ID links
 * to `registry.url` when present (new tab, noopener). Last synced cell
 * includes a "Synced N days ago" freshness note when `lastSyncedAt` is set.
 */

import type { RegistryRow } from '@/lib/queries/project-detail';

type Props = {
  rows: RegistryRow[];
};

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatDate(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = MONTHS_SHORT[d.getUTCMonth()];
  const year = d.getUTCFullYear();
  return `${day} ${month} ${year}`;
}

function daysSince(d: Date, now: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const end = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return Math.max(0, Math.floor((end - start) / msPerDay));
}

function statusPill(status: string | null): string {
  switch (status) {
    case 'active':
      return 'kl-pill--success';
    case 'suspended':
      return 'kl-pill--danger';
    default:
      return 'kl-pill--neutral';
  }
}

export function RegistryList({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <section id="registries" style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Registries</p>
        <div className="kl-card">
          <p className="kl-page-subtitle">No registry records found.</p>
        </div>
      </section>
    );
  }

  const now = new Date();

  return (
    <section id="registries" style={{ marginBottom: 32 }}>
      <p className="kl-section-label">Registries</p>
      <div className="kl-card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="kl-table">
          <thead>
            <tr>
              <th>Registry</th>
              <th>External ID</th>
              <th>Status</th>
              <th>Last synced</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const synced = r.lastSyncedAt ? new Date(r.lastSyncedAt) : null;
              return (
                <tr key={r.id}>
                  <td>{r.registryName}</td>
                  <td>
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.externalId}
                      </a>
                    ) : (
                      r.externalId
                    )}
                  </td>
                  <td>
                    <span className={`kl-pill ${statusPill(r.status)}`}>
                      {r.status ?? '—'}
                    </span>
                  </td>
                  <td>
                    {synced ? (
                      <>
                        {formatDate(synced)}
                        <span className="kl-muted" style={{ marginLeft: 6 }}>
                          · Synced {daysSince(synced, now)} days ago
                        </span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
