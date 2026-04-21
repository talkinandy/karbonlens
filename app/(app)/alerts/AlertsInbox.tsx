'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import type { NotificationRow as NotificationRowDto } from '@/lib/queries/notifications';

const TYPE_OPTIONS = [
  'reversal',
  'price',
  'regulatory',
  'news',
  'retirement',
  'issuance',
] as const;

type Props = {
  rows: NotificationRowDto[];
  unreadCount: number;
  activeTypes: string[];
  activeRead: 'all' | 'unread';
  activeProject: { slug: string; name: string } | null;
  nextCursor: string | null;
  currentCursor: string | null;
};

/**
 * Client-side inbox chrome: filter bar, bulk-select, mark-read, and
 * pagination. Rows come from the server component — this component does
 * no DB access itself, only URL mutation + mark-read API calls.
 */
export function AlertsInbox({
  rows,
  unreadCount,
  activeTypes,
  activeRead,
  activeProject,
  nextCursor,
  currentCursor,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateParam = useCallback(
    (mutate: (p: URLSearchParams) => void) => {
      const next = new URLSearchParams(searchParams.toString());
      mutate(next);
      // Reset cursor whenever filters change.
      next.delete('before');
      const qs = next.toString();
      startTransition(() => {
        router.push(qs ? `/alerts?${qs}` : '/alerts');
      });
    },
    [router, searchParams],
  );

  const toggleType = useCallback(
    (type: string) => {
      updateParam((p) => {
        const current = (p.get('type') ?? '').split(',').filter(Boolean);
        const has = current.includes(type);
        const next = has
          ? current.filter((t) => t !== type)
          : [...current, type];
        if (next.length === 0) p.delete('type');
        else p.set('type', next.join(','));
      });
    },
    [updateParam],
  );

  const setReadFilter = useCallback(
    (read: 'all' | 'unread') => {
      updateParam((p) => {
        if (read === 'all') p.delete('read');
        else p.set('read', 'unread');
      });
    },
    [updateParam],
  );

  const clearProjectFilter = useCallback(() => {
    updateParam((p) => p.delete('project'));
  }, [updateParam]);

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggleSelectAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === rows.length) return new Set();
      return new Set(rows.map((r) => r.id));
    });
  }, [rows]);

  async function markSelectedRead() {
    if (selected.size === 0) return;
    setMarking(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as read');
    } finally {
      setMarking(false);
    }
  }

  async function markAllRead() {
    setMarking(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setSelected(new Set());
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark all as read');
    } finally {
      setMarking(false);
    }
  }

  const loadMoreHref = useMemo(() => {
    if (!nextCursor) return null;
    const next = new URLSearchParams(searchParams.toString());
    next.set('before', nextCursor);
    return `/alerts?${next.toString()}`;
  }, [nextCursor, searchParams]);

  const activeTypeSet = new Set(activeTypes);

  return (
    <main className="kl-page">
      <header
        className="kl-page-header"
        style={{ alignItems: 'flex-start' }}
      >
        <div>
          <p className="kl-section-label">
            Notifications · personal inbox
          </p>
          <h1 className="kl-page-title">Alerts</h1>
          <p className="kl-page-subtitle">
            {unreadCount === 0
              ? 'All caught up.'
              : `${unreadCount > 99 ? '99+' : unreadCount} unread`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="kl-btn"
            onClick={markAllRead}
            disabled={marking || unreadCount === 0}
            style={{
              fontSize: 12,
              padding: '6px 12px',
              border: '0.5px solid var(--border-strong)',
              borderRadius: 6,
              background: 'var(--surface)',
              cursor: marking || unreadCount === 0 ? 'default' : 'pointer',
              opacity: unreadCount === 0 ? 0.5 : 1,
            }}
          >
            Mark all as read
          </button>
        </div>
      </header>

      <section
        className="kl-card"
        style={{ padding: 12, marginBottom: 16 }}
        aria-label="Filters"
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            alignItems: 'center',
          }}
        >
          <span
            className="kl-section-label"
            style={{ margin: 0, marginRight: 8 }}
          >
            Type
          </span>
          <FilterPill
            active={activeTypeSet.size === 0}
            onClick={() => updateParam((p) => p.delete('type'))}
          >
            All
          </FilterPill>
          {TYPE_OPTIONS.map((t) => (
            <FilterPill
              key={t}
              active={activeTypeSet.has(t)}
              onClick={() => toggleType(t)}
              data-type={t}
            >
              {t}
            </FilterPill>
          ))}

          <span
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: 'var(--border)',
              margin: '0 8px',
            }}
          />

          <span
            className="kl-section-label"
            style={{ margin: 0, marginRight: 8 }}
          >
            Read
          </span>
          <FilterPill
            active={activeRead === 'all'}
            onClick={() => setReadFilter('all')}
          >
            All
          </FilterPill>
          <FilterPill
            active={activeRead === 'unread'}
            onClick={() => setReadFilter('unread')}
          >
            Unread only
          </FilterPill>

          {activeProject ? (
            <>
              <span
                aria-hidden
                style={{
                  width: 1,
                  height: 18,
                  background: 'var(--border)',
                  margin: '0 8px',
                }}
              />
              <span
                className="kl-section-label"
                style={{ margin: 0, marginRight: 8 }}
              >
                Project
              </span>
              <FilterPill
                active
                onClick={clearProjectFilter}
                title="Click to clear"
              >
                {activeProject.name} ×
              </FilterPill>
            </>
          ) : null}
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="kl-card"
          style={{
            padding: 12,
            marginBottom: 12,
            color: 'var(--danger-fg)',
            background: 'var(--danger-bg)',
            border: 'none',
          }}
        >
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <section
          className="kl-card"
          style={{ padding: 40, textAlign: 'center' }}
        >
          <p className="kl-stat-label" style={{ marginBottom: 12 }}>
            No notifications
          </p>
          <p
            style={{
              fontFamily: 'var(--font-instrument-serif), Georgia, serif',
              fontSize: 20,
              lineHeight: 1.3,
              margin: '0 auto',
              maxWidth: 480,
            }}
          >
            No notifications yet. Alerts from monitored projects will
            appear here.
          </p>
        </section>
      ) : (
        <>
          <section
            className="kl-card"
            style={{ padding: 0, overflow: 'hidden' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                borderBottom: '0.5px solid var(--border)',
                background: 'var(--surface-2)',
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleSelectAll}
                aria-label="Select all on page"
              />
              <span
                className="kl-section-label"
                style={{ margin: 0, flex: 1 }}
              >
                {selected.size > 0
                  ? `${selected.size} selected`
                  : `${rows.length} notifications`}
              </span>
              <button
                type="button"
                onClick={markSelectedRead}
                disabled={selected.size === 0 || marking}
                style={{
                  fontSize: 12,
                  padding: '4px 10px',
                  border: '0.5px solid var(--border-strong)',
                  borderRadius: 6,
                  background: selected.size === 0 ? 'transparent' : 'var(--surface)',
                  cursor:
                    selected.size === 0 || marking
                      ? 'default'
                      : 'pointer',
                  opacity: selected.size === 0 ? 0.5 : 1,
                }}
              >
                Mark selected as read
              </button>
            </div>

            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
              }}
            >
              {rows.map((n) => (
                <li
                  key={n.id}
                  style={{ borderBottom: '0.5px solid var(--border)' }}
                >
                  <NotificationRow
                    notification={n}
                    selectable
                    selected={selected.has(n.id)}
                    onToggleSelect={toggleSelect}
                  />
                </li>
              ))}
            </ul>
          </section>

          <nav
            style={{
              marginTop: 16,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
            }}
            aria-label="Pagination"
          >
            {currentCursor ? (
              <Link
                href="/alerts"
                className="kl-btn"
                style={{
                  fontSize: 12,
                  padding: '8px 14px',
                  border: '0.5px solid var(--border-strong)',
                  borderRadius: 6,
                  background: 'var(--surface)',
                }}
              >
                ← First page
              </Link>
            ) : null}
            {loadMoreHref ? (
              <Link
                href={loadMoreHref}
                className="kl-btn"
                style={{
                  fontSize: 12,
                  padding: '8px 14px',
                  border: '0.5px solid var(--border-strong)',
                  borderRadius: 6,
                  background: 'var(--surface)',
                }}
              >
                Load more →
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </main>
  );
}

function FilterPill({
  active,
  onClick,
  children,
  title,
  ...rest
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      {...rest}
      style={{
        fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
        fontSize: 11,
        padding: '4px 10px',
        borderRadius: 999,
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        border: `0.5px solid ${active ? 'var(--text)' : 'var(--border)'}`,
        background: active ? 'var(--text)' : 'var(--surface)',
        color: active ? 'var(--surface)' : 'var(--text-2)',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}
