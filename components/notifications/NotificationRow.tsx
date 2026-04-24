'use client';

import Link from 'next/link';
import type { NotificationDto } from '@/lib/queries/notifications';

type Props = {
  notification: NotificationDto & {
    project_slug?: string | null;
    project_name?: string | null;
  };
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  onClick?: () => void;
};

/**
 * Canonical type -> color + icon table per T16 §3 item 5. Colors are
 * applied via `.kl-badge--<type>` classes defined in `app/globals.css`;
 * only the icon lookup happens here.
 *   reversal   red     AlertTriangle
 *   price      purple  TrendingUp
 *   regulatory blue    Scale
 *   news       gray    Newspaper
 *   retirement green   Check
 *   issuance   amber   Plus
 *   <unknown>  gray    Info
 */

export function NotificationRow({
  notification: n,
  compact = false,
  selectable = false,
  selected = false,
  onToggleSelect,
  onClick,
}: Props) {
  const unread = n.read_at === null;
  const href = n.url ?? (n.project_slug ? `/projects/${n.project_slug}` : null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: compact ? '10px 16px' : '14px 16px',
        background: unread ? 'rgba(230, 241, 251, 0.35)' : 'transparent',
      }}
    >
      {selectable ? (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(n.id)}
          aria-label={`Select notification: ${n.title}`}
          style={{ marginTop: 4 }}
        />
      ) : null}

      <span
        aria-label={unread ? 'Unread' : 'Read'}
        title={unread ? 'Unread' : 'Read'}
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          marginTop: 6,
          flexShrink: 0,
          background: unread ? '#378add' : 'transparent',
          border: unread ? 'none' : '1px solid var(--border-strong)',
        }}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 4,
          }}
        >
          <TypeBadge type={n.type} />
          {n.project_slug && n.project_name ? (
            <Link
              href={`/projects/${n.project_slug}`}
              onClick={(e) => e.stopPropagation()}
              className="kl-notification-project"
              style={{
                fontSize: 11,
                color: 'var(--text-2)',
                textDecoration: 'underline',
                textUnderlineOffset: 2,
              }}
            >
              {n.project_name}
            </Link>
          ) : !compact ? (
            <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
          ) : null}
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              marginLeft: 'auto',
              whiteSpace: 'nowrap',
            }}
          >
            {formatRelative(n.created_at)}
          </span>
        </div>

        {href ? (
          <Link
            href={href}
            onClick={onClick}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              display: 'block',
              lineHeight: 1.35,
            }}
          >
            {truncate(n.title, 80)}
          </Link>
        ) : (
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: 'var(--text)',
              display: 'block',
              lineHeight: 1.35,
            }}
          >
            {truncate(n.title, 80)}
          </span>
        )}

        {n.description ? (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 12,
              color: 'var(--text-2)',
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {truncate(n.description, 120)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const Icon = TYPE_ICONS[type] ?? InfoIcon;
  // Colors come from globals.css (`.kl-badge--<type>`) so AC-10 can
  // verify distinct background values via CSSOM. The fallback class is
  // applied for unknown types; the `kl-badge` base class only provides
  // layout/typography.
  const typeClass = TYPE_ICONS[type] ? `kl-badge--${type}` : 'kl-badge--news';
  return (
    <span className={`kl-badge ${typeClass}`} data-type={type}>
      <Icon />
      {type}
    </span>
  );
}

// ─── Icon primitives (inline SVG; 12px) ──────────────────────────────────
function AlertTriangleIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2.5 14.5 13h-13L8 2.5Z" />
      <path d="M8 7v3" />
      <circle cx={8} cy={12} r={0.6} fill="currentColor" stroke="none" />
    </svg>
  );
}
function TrendingUpIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12 6 8l3 3 5-6" />
      <path d="M10 5h4v4" />
    </svg>
  );
}
function ScaleIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 2v12" />
      <path d="M4 14h8" />
      <path d="M3 6h10" />
      <path d="m3 6-2 4a3 3 0 0 0 6 0L5 6" />
      <path d="m13 6-2 4a3 3 0 0 0 6 0L15 6" transform="translate(-2 0)" />
    </svg>
  );
}
function NewspaperIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x={2} y={3} width={12} height={10} rx={1} />
      <path d="M5 6h6M5 9h6M5 11h3" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m3 8 3.5 3.5L13 5" />
    </svg>
  );
}
function PlusIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}
function InfoIcon() {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx={8} cy={8} r={6} />
      <path d="M8 7v4" />
      <circle cx={8} cy={5} r={0.6} fill="currentColor" stroke="none" />
    </svg>
  );
}

const TYPE_ICONS: Record<string, () => React.JSX.Element> = {
  reversal: AlertTriangleIcon,
  price: TrendingUpIcon,
  regulatory: ScaleIcon,
  news: NewspaperIcon,
  retirement: CheckIcon,
  issuance: PlusIcon,
};

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function formatRelative(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d <= 30) return `${d}d ago`;
  // Fall back to ISO date (YYYY-MM-DD) beyond 30 days.
  return iso.slice(0, 10);
}
