'use client';

import Link from 'next/link';
import type { NotificationDto } from '@/lib/queries/notifications';
import { NotificationRow } from './NotificationRow';

type Props = {
  items: NotificationDto[] | null;
  loading: boolean;
  error: string | null;
  onMarkAllRead: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

/**
 * Dropdown panel anchored to the bell. Renders the latest 10 notifications,
 * a "Mark all as read" action, and a footer "View all" link to `/alerts`.
 */
export function NotificationDropdown({
  items,
  loading,
  error,
  onMarkAllRead,
  onRefresh,
  onClose,
}: Props) {
  return (
    <div
      role="dialog"
      aria-label="Notifications"
      className="kl-notification-dropdown"
      style={{
        position: 'absolute',
        top: '100%',
        right: 0,
        marginTop: 8,
        width: 360,
        maxHeight: 480,
        background: 'var(--surface)',
        border: '0.5px solid var(--border)',
        borderRadius: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.10)',
        zIndex: 60,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '0.5px solid var(--border)',
          gap: 8,
        }}
      >
        <strong style={{ fontSize: 13 }}>Notifications</strong>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={onRefresh}
            className="kl-nav-link"
            style={{
              fontSize: 12,
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-2)',
            }}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={onMarkAllRead}
            style={{
              fontSize: 12,
              padding: '4px 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--info-fg)',
            }}
          >
            Mark all as read
          </button>
        </div>
      </header>

      <div style={{ overflowY: 'auto', flex: 1 }}>
        {loading && items === null ? (
          <p
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-2)',
              margin: 0,
              fontSize: 13,
            }}
          >
            Loading…
          </p>
        ) : error ? (
          <p
            role="alert"
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--danger-fg)',
              margin: 0,
              fontSize: 13,
            }}
          >
            {error}
          </p>
        ) : !items || items.length === 0 ? (
          <p
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-2)',
              margin: 0,
              fontSize: 13,
            }}
          >
            No notifications yet.
          </p>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
            }}
          >
            {items.map((n) => (
              <li
                key={n.id}
                style={{ borderBottom: '0.5px solid var(--border)' }}
              >
                <NotificationRow
                  notification={n}
                  compact
                  onClick={onClose}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer
        style={{
          padding: '10px 16px',
          borderTop: '0.5px solid var(--border)',
          textAlign: 'center',
        }}
      >
        <Link
          href="/alerts"
          onClick={onClose}
          style={{
            fontSize: 12,
            color: 'var(--info-fg)',
            fontWeight: 500,
          }}
        >
          View all →
        </Link>
      </footer>
    </div>
  );
}
