'use client';

/**
 * components/admin/MatchQueueRow.tsx — T21 per-pair row card.
 *
 * Client component because it owns the modal-open state for <ApproveModal>,
 * and because "reject" and "defer" fire JSON POSTs that need a fetch-based
 * handler (server actions are avoided to keep the admin area independent
 * of server-action wiring for v0.1).
 *
 * Renders two candidate project summaries side by side with a match-metadata
 * strip in the middle, plus three action buttons (Approve / Reject / Defer).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { QueueRowWithProjects, QueueProjectSummary } from '@/lib/queries/match-queue';
import { displayStatus, badgePillClass } from '@/lib/display/status';
import { ApproveModal } from './ApproveModal';

type Props = { row: QueueRowWithProjects };

function formatSimilarity(raw: string | null): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return `${(n * 100).toFixed(1)} %`;
}

function formatNumber(raw: string | null): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString('en-US');
}

function ProjectColumn({ p, label }: { p: QueueProjectSummary; label: string }) {
  const s = displayStatus(p.status);
  return (
    <div>
      <div className="kl-section-label" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>
        {p.nameCanonical}
      </div>
      <div style={{ marginBottom: 8 }}>
        <span className={`kl-pill ${badgePillClass(s.badge)}`}>{s.label}</span>
      </div>
      <dl
        style={{
          fontSize: 12,
          color: 'var(--text-2)',
          margin: 0,
          display: 'grid',
          gridTemplateColumns: '88px 1fr',
          rowGap: 3,
          columnGap: 8,
        }}
      >
        <dt>Developer</dt>
        <dd style={{ margin: 0 }}>{p.developer ?? '—'}</dd>
        <dt>Methodology</dt>
        <dd style={{ margin: 0 }}>{p.methodology ?? '—'}</dd>
        <dt>Hectares</dt>
        <dd style={{ margin: 0 }}>{formatNumber(p.hectares)}</dd>
        <dt>Province</dt>
        <dd style={{ margin: 0 }}>{p.province ?? '—'}</dd>
        <dt>Registries</dt>
        <dd style={{ margin: 0 }}>
          {p.registryNames.length > 0 ? p.registryNames.join(', ') : '—'}
        </dd>
        <dt>VCUs issued</dt>
        <dd style={{ margin: 0 }}>{formatNumber(p.totalVcusIssued)}</dd>
        <dt style={{ fontFamily: 'var(--font-mono, monospace)' }}>ID</dt>
        <dd
          style={{
            margin: 0,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            wordBreak: 'break-all',
          }}
        >
          {p.id || '(deleted)'}
        </dd>
      </dl>
    </div>
  );
}

export function MatchQueueRow({ row }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function post(url: string, body: unknown): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function handleReject() {
    if (pending || done) return;
    if (!confirm(`Reject this pair? Both projects will remain as distinct rows.\n\nA: ${row.projectA.nameCanonical}\nB: ${row.projectB.nameCanonical}`)) {
      return;
    }
    setError(null);
    const res = await post('/api/admin/match-queue/reject', { id: row.queueId });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {}
      setError(msg);
      return;
    }
    setDone('Rejected');
    startTransition(() => router.refresh());
  }

  async function handleDefer() {
    if (pending || done) return;
    setError(null);
    const res = await post('/api/admin/match-queue/defer', { id: row.queueId });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {}
      setError(msg);
      return;
    }
    setDone('Deferred');
    startTransition(() => router.refresh());
  }

  async function handleApproveConfirmed(): Promise<string | null> {
    const res = await post('/api/admin/match-queue/approve', {
      id: row.queueId,
      confirmed: 'APPROVE',
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = (await res.json()) as { error?: string };
        if (j.error) msg = j.error;
      } catch {}
      return msg;
    }
    setDone('Approved');
    setModalOpen(false);
    startTransition(() => router.refresh());
    return null;
  }

  const isResolved = done !== null;
  const buttonBase: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid var(--border)',
    fontSize: 13,
    fontFamily: 'inherit',
    cursor: isResolved || pending ? 'not-allowed' : 'pointer',
    opacity: isResolved || pending ? 0.5 : 1,
  };

  return (
    <div className="kl-card" style={{ padding: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 160px 1fr',
          gap: 16,
          alignItems: 'stretch',
        }}
      >
        <ProjectColumn p={row.projectA} label="Candidate A (keep)" />
        <div
          style={{
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            padding: '0 12px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <div className="kl-section-label" style={{ marginBottom: 6 }}>
            Match
          </div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>
            {formatSimilarity(row.similarity)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
            {row.matchReason ?? '—'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 6 }}>
            {new Date(row.createdAt).toISOString().slice(0, 10)}
          </div>
        </div>
        <ProjectColumn p={row.projectB} label="Candidate B (merge + delete)" />
      </div>

      <div
        style={{
          display: 'flex',
          gap: 8,
          justifyContent: 'flex-end',
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
          alignItems: 'center',
        }}
      >
        {error ? (
          <span
            role="alert"
            style={{ color: '#b91c1c', fontSize: 12, marginRight: 'auto' }}
          >
            {error}
          </span>
        ) : null}
        {done ? (
          <span
            style={{ color: 'var(--text-2)', fontSize: 12, marginRight: 'auto' }}
          >
            {done}. Refreshing…
          </span>
        ) : null}
        <button
          type="button"
          onClick={handleDefer}
          disabled={isResolved || pending}
          style={buttonBase}
        >
          Defer
        </button>
        <button
          type="button"
          onClick={handleReject}
          disabled={isResolved || pending}
          style={buttonBase}
        >
          Reject
        </button>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          disabled={isResolved || pending}
          style={{
            ...buttonBase,
            background: '#b91c1c',
            borderColor: '#b91c1c',
            color: '#fff',
            fontWeight: 600,
          }}
        >
          Approve merge
        </button>
      </div>

      {modalOpen ? (
        <ApproveModal
          aName={row.projectA.nameCanonical}
          bName={row.projectB.nameCanonical}
          onCancel={() => setModalOpen(false)}
          onConfirm={handleApproveConfirmed}
        />
      ) : null}
    </div>
  );
}
