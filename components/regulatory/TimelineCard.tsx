/**
 * TimelineCard — single regulatory event rendered as an <article>.
 *
 * Contract (T15 §3.3):
 *   - <article> root; event date wrapped in <time dateTime="YYYY-MM-DD">.
 *   - 4px left border stripe mapped to importance via the fixed palette:
 *       critical → #DC2626 (red-600)
 *       high     → #D97706 (amber-600)
 *       medium   → #2563EB (blue-600)
 *       low      → #6B7280 (gray-500)
 *   - Upcoming rows (is_upcoming=TRUE) render with `border-dashed border-2`
 *     and a "Forecast" pill (amber bg, dark text) beside the date.
 *   - Ministry badge (muted pill).
 *   - Document-type + document-number pill, e.g. "POJK 14/2023". Suppressed
 *     when document_number is a sentinel ('N/A' or an ALL-CAPS-A-Z_dash-YYYY
 *     sentinel like 'IDX-LAUNCH-2026'); in that case we show just the type.
 *     If both are null, no pill renders.
 *   - Summary is language-dependent. Fallback: if summary[active] is NULL,
 *     render the other language + a small `(EN)` or `(ID)` indicator
 *     (T15 §7.7).
 *   - Document URL link rendered only when documentUrl IS NOT NULL; anchor
 *     opens in a new tab with rel="noopener noreferrer".
 */

import Link from 'next/link';

import type { RegulatoryEventRow } from '@/lib/queries/regulatory';

const IMPORTANCE_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high: '#D97706',
  medium: '#2563EB',
  low: '#6B7280',
};

const MONTH_ABBR = [
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

function formatDateShort(iso: string): string {
  // Parse 'YYYY-MM-DD' manually to avoid TZ shifts that `new Date(iso)` can
  // introduce in non-UTC runtimes.
  const [yStr, mStr, dStr] = iso.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_ABBR[m - 1]} ${y}`;
}

/**
 * Returns true if the given document number should be treated as a sentinel
 * rather than a real human-readable document reference.
 *   - 'N/A' (Row 5)
 *   - /^[A-Z]+-[A-Z]+-\d{4}$/ (e.g. 'IDX-LAUNCH-2026')
 */
function isSentinelDocNumber(docNumber: string | null): boolean {
  if (!docNumber) return false;
  if (docNumber === 'N/A') return true;
  return /^[A-Z]+-[A-Z]+-\d{4}$/.test(docNumber);
}

/**
 * Derive the per-event detail slug. Mirrors the SQL formula in
 * `app/sitemap.ts` and `lib/queries/regulatory-detail.ts`:
 *   lower(replace(replace(coalesce(type,'') || '-' || coalesce(number,''),
 *                         '/', '-'), ' ', '-'))
 * Returns null when both inputs are missing or the result collapses to the
 * sentinel '-' (matches the sitemap's filter).
 */
function deriveSlug(
  documentType: string | null,
  documentNumber: string | null,
): string | null {
  const t = documentType ?? '';
  const n = documentNumber ?? '';
  const raw = `${t}-${n}`.replace(/\//g, '-').replace(/ /g, '-').toLowerCase();
  if (!raw || raw === '-') return null;
  return raw;
}

export function TimelineCard({
  event,
  lang,
}: {
  event: RegulatoryEventRow;
  lang: 'en' | 'id';
}) {
  const stripeColor =
    (event.importance && IMPORTANCE_COLOR[event.importance]) ||
    IMPORTANCE_COLOR.low;

  // Summary + fallback indicator (T15 §7.7).
  const activeSummary = lang === 'id' ? event.summaryId : event.summaryEn;
  const fallbackSummary = lang === 'id' ? event.summaryEn : event.summaryId;
  const effectiveSummary = activeSummary ?? fallbackSummary ?? null;
  const usedFallback =
    activeSummary == null && fallbackSummary != null;
  const fallbackLabel = lang === 'id' ? '(EN)' : '(ID)';

  // Document-type + document-number pill composition.
  const sentinel = isSentinelDocNumber(event.documentNumber);
  const docPillText = event.documentType
    ? sentinel || !event.documentNumber
      ? event.documentType
      : `${event.documentType} ${event.documentNumber}`
    : null;

  const isUpcoming = event.isUpcoming === true;

  // T31 — per-event detail slug. Null when no meaningful slug exists; in
  // that case we fall back to plain (unlinked) text so we never produce a
  // dead `/regulatory/-` href.
  const slug = deriveSlug(event.documentType, event.documentNumber);
  const detailHref = slug ? `/regulatory/${slug}` : null;

  return (
    <article
      className="kl-card"
      style={{
        padding: '16px 16px 16px 20px',
        borderLeft: `4px solid ${stripeColor}`,
        ...(isUpcoming
          ? {
              borderStyle: 'dashed',
              borderWidth: '2px',
              // Left stripe stays solid for importance — override only the
              // non-left sides via individual props below.
              borderTopStyle: 'dashed',
              borderRightStyle: 'dashed',
              borderBottomStyle: 'dashed',
            }
          : {}),
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <time
          dateTime={event.eventDate}
          className="tnum"
          style={{
            fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
            fontSize: 12,
            color: 'var(--text-2)',
          }}
        >
          {formatDateShort(event.eventDate)}
        </time>

        {isUpcoming ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 999,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              background: 'var(--warning-bg)',
              color: 'var(--text)',
            }}
          >
            Forecast
          </span>
        ) : null}

        {event.ministry ? (
          <span className="kl-pill kl-pill--neutral">{event.ministry}</span>
        ) : null}

        {docPillText ? (
          detailHref ? (
            <Link
              href={detailHref}
              className="kl-pill kl-pill--info"
              style={{ textDecoration: 'none' }}
            >
              {docPillText}
            </Link>
          ) : (
            <span className="kl-pill kl-pill--info">{docPillText}</span>
          )
        ) : null}

        {event.importance ? (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 999,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              background: 'transparent',
              color: stripeColor,
              border: `0.5px solid ${stripeColor}`,
            }}
          >
            {event.importance}
          </span>
        ) : null}
      </header>

      <h2
        style={{
          fontFamily: 'var(--font-instrument-serif), Georgia, serif',
          fontSize: 20,
          fontWeight: 400,
          margin: '0 0 8px',
          lineHeight: 1.3,
          letterSpacing: '-0.2px',
        }}
      >
        {detailHref ? (
          <Link
            href={detailHref}
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            {event.title}
          </Link>
        ) : (
          event.title
        )}
      </h2>

      {effectiveSummary ? (
        <p
          style={{
            margin: '0 0 12px',
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--text)',
          }}
        >
          {effectiveSummary}
          {usedFallback ? (
            <span
              style={{
                marginLeft: 6,
                fontSize: 11,
                color: 'var(--text-3)',
                fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
              }}
            >
              {fallbackLabel}
            </span>
          ) : null}
        </p>
      ) : null}

      {event.tags && event.tags.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
          {event.tags.map((t) => (
            <span key={t} className="kl-pill kl-pill--neutral">
              {t}
            </span>
          ))}
        </div>
      ) : null}

      {event.documentUrl ? (
        <a
          href={event.documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
            fontSize: 12,
            color: 'var(--info-fg)',
            textDecoration: 'underline',
          }}
        >
          View document →
        </a>
      ) : null}
    </article>
  );
}
