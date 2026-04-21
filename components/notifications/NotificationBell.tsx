'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import type {
  CountOnlyResponse,
  FullResponse,
  NotificationsResponse,
} from '@/app/api/notifications/route';
import { NotificationDropdown } from './NotificationDropdown';

/**
 * NotificationBell — client component mounted in the (app) layout's
 * rightSlot, left of <UserMenu />.
 *
 * Polling: none. The unread count refetches on `usePathname()` change
 * (route navigation), per Andy's override in T16 §2. A manual Refresh
 * button in the dropdown is the user escape hatch.
 *
 * Optimistic mark-all: decrement `unread` to 0 immediately; revert via
 * `prev` snapshot if the API call fails.
 */
export function NotificationBell() {
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [latest, setLatest] = useState<FullResponse['latest'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?countOnly=true', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) return;
      const body = (await res.json()) as CountOnlyResponse;
      if (typeof body.unread_count === 'number') setUnread(body.unread_count);
    } catch {
      /* network blip — silent */
    }
  }, []);

  const loadFull = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/notifications?limit=10', {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as NotificationsResponse;
      if ('latest' in body) {
        setLatest(body.latest);
        setUnread(body.unread_count);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial + route-change count refresh.
  useEffect(() => {
    refreshCount();
  }, [pathname, refreshCount]);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadFull();
  }

  async function markAllAsRead() {
    const prev = unread;
    setUnread(0);
    setLatest((rows) =>
      rows
        ? rows.map((r) => ({
            ...r,
            read_at: r.read_at ?? new Date().toISOString(),
          }))
        : rows,
    );
    try {
      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ all: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as {
        updated: number;
        unread_count: number;
      };
      setUnread(body.unread_count);
      // Ensure /alerts sees the fresh state if it's currently rendered.
      startTransition(() => router.refresh());
    } catch (e) {
      setUnread(prev);
      setError(e instanceof Error ? e.message : 'Failed to mark all as read');
    }
  }

  const badgeText =
    unread === 0 ? null : unread > 99 ? '99+' : String(unread);

  return (
    <div
      ref={wrapRef}
      className="kl-notification-wrap"
      style={{ position: 'relative', display: 'inline-flex' }}
    >
      <button
        type="button"
        onClick={toggle}
        aria-label={
          unread > 0
            ? `Notifications (${unread} unread)`
            : 'Notifications'
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        className="kl-notification-bell"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 32,
          height: 32,
          borderRadius: 6,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          position: 'relative',
          color: 'var(--text)',
        }}
      >
        <BellIcon />
        {badgeText ? (
          <span
            className="kl-notification-badge"
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              minWidth: '1.5rem',
              height: 16,
              padding: '0 4px',
              borderRadius: 999,
              background: '#e24b4a',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              lineHeight: '16px',
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              boxSizing: 'border-box',
            }}
          >
            {badgeText}
          </span>
        ) : null}
      </button>

      {open ? (
        <NotificationDropdown
          items={latest}
          loading={loading}
          error={error}
          onMarkAllRead={markAllAsRead}
          onRefresh={loadFull}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}

function BellIcon() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5.5 8.5a4.5 4.5 0 0 1 9 0v2.25c0 .6.24 1.17.66 1.59l.59.59a.9.9 0 0 1-.64 1.54H4.89a.9.9 0 0 1-.64-1.54l.59-.59c.42-.42.66-.99.66-1.59V8.5Z" />
      <path d="M8.2 16.5a2 2 0 0 0 3.6 0" />
    </svg>
  );
}

// Re-export the tiny Link used by the dropdown "View all" footer so that
// this module remains the entry point for the bell's public surface.
export { Link };
