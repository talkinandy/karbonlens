'use client';

/**
 * components/admin/ApproveModal.tsx — T21 typed-confirmation modal.
 *
 * Rendered by <MatchQueueRow> when the admin clicks "Approve merge". The
 * admin must type the exact string "APPROVE" (case-sensitive) for the
 * confirm button to enable. The server route re-checks the token, so the
 * client gate is strictly UX — not a security boundary.
 *
 * Summarises the SQL operations that will run so the admin sees a
 * plain-English description of the merge before committing.
 */

import { useState } from 'react';

type Props = {
  aName: string;
  bName: string;
  onCancel: () => void;
  /**
   * Resolves with `null` on success (modal will close) or an error message
   * string that the modal will display inline.
   */
  onConfirm: () => Promise<string | null>;
};

const REQUIRED_TOKEN = 'APPROVE';

export function ApproveModal({ aName, bName, onCancel, onConfirm }: Props) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = typed === REQUIRED_TOKEN;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    const err = await onConfirm();
    if (err) {
      setError(err);
      setBusy(false);
    }
    // on success the parent closes the modal (unmount)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="approve-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="kl-card"
        style={{
          width: 520,
          maxWidth: '90vw',
          padding: 20,
          background: 'var(--surface-1, #fff)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        <h2
          id="approve-modal-title"
          style={{ margin: '0 0 10px', fontSize: 18, fontWeight: 600 }}
        >
          Confirm merge
        </h2>
        <p style={{ margin: '0 0 14px', fontSize: 13 }}>
          You are about to merge <strong>{bName}</strong> into{' '}
          <strong>{aName}</strong>. This will:
        </p>
        <ul
          style={{
            margin: '0 0 14px',
            paddingLeft: 20,
            fontSize: 12.5,
            color: 'var(--text-2)',
            lineHeight: 1.55,
          }}
        >
          <li>Re-parent all registries rows from B to A</li>
          <li>Re-parent all issuances rows from B to A</li>
          <li>Re-parent all retirements rows from B to A</li>
          <li>Re-parent satellite alerts from B to A (duplicates skipped)</li>
          <li>Re-parent notifications from B to A (duplicates skipped)</li>
          <li>Add B&apos;s slug and canonical name to A&apos;s name_aliases</li>
          <li>Delete project B permanently</li>
          <li>Mark the queue row as approved</li>
          <li>Write an entry to admin_actions</li>
        </ul>

        <label
          htmlFor="approve-token"
          style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}
        >
          Type <code style={{ background: 'var(--surface-2, #f4f4f5)', padding: '1px 5px', borderRadius: 3 }}>APPROVE</code>{' '}
          to confirm (case-sensitive):
        </label>
        <input
          id="approve-token"
          type="text"
          value={typed}
          autoFocus
          onChange={(e) => setTyped(e.target.value)}
          disabled={busy}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          style={{
            width: '100%',
            padding: '6px 10px',
            border: '1px solid var(--border)',
            borderRadius: 4,
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 13,
            marginBottom: 14,
            boxSizing: 'border-box',
          }}
        />

        {error ? (
          <div
            role="alert"
            style={{
              background: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              padding: '8px 10px',
              borderRadius: 4,
              fontSize: 12,
              marginBottom: 12,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'transparent',
              fontSize: 13,
              fontFamily: 'inherit',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!ready || busy}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: '1px solid #b91c1c',
              background: ready && !busy ? '#b91c1c' : '#fca5a5',
              color: '#fff',
              fontSize: 13,
              fontFamily: 'inherit',
              fontWeight: 600,
              cursor: ready && !busy ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? 'Merging…' : 'Merge projects'}
          </button>
        </div>
      </form>
    </div>
  );
}
