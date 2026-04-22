/**
 * app/admin/queue/page.tsx — T21 entity-resolution review list.
 *
 * Server component. Loads all rows from `project_match_queue` with status =
 * 'pending' and renders one card per candidate pair via <MatchQueueRow>.
 *
 * Auth: enforced by both the middleware (`proxy.ts`) and the parent
 * `app/admin/layout.tsx`. This page assumes an admin session and does not
 * re-check.
 *
 * Empty state: matches the T11 §3.6 pattern — a `.kl-card` with the
 * `.kl-section-label` heading describing an empty result.
 */

import 'server-only';

import { getPendingQueueRows } from '@/lib/queries/match-queue';
import { MatchQueueRow } from '@/components/admin/MatchQueueRow';

export const dynamic = 'force-dynamic';

export default async function AdminQueuePage() {
  const rows = await getPendingQueueRows();

  return (
    <main className="kl-page" aria-label="Entity resolution — match queue">
      <header className="kl-page-header" style={{ paddingTop: 16 }}>
        <div className="kl-section-label">Admin — Entity resolution</div>
        <h1 style={{ margin: '4px 0 6px', fontSize: 22, fontWeight: 600 }}>
          Match queue
        </h1>
        <p style={{ color: 'var(--text-2)', fontSize: 13, margin: 0 }}>
          Review duplicate project pairs flagged by the Verra scraper. Approve
          to merge B into A, reject to mark the pair as distinct, or defer to
          revisit later.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="kl-card" style={{ padding: 20 }}>
          <div className="kl-section-label">No pending matches</div>
          <p style={{ margin: '8px 0 0', color: 'var(--text-2)', fontSize: 13 }}>
            All pairs have been reviewed. New pairs will appear here the next
            time the Verra scraper detects a duplicate candidate.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {rows.map((row) => (
            <MatchQueueRow key={row.queueId} row={row} />
          ))}
        </div>
      )}
    </main>
  );
}
