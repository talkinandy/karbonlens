/**
 * Regulatory timeline page (T15).
 *
 * Server component. Reads filter state from URL `searchParams` (Next.js 16 —
 * the prop is a Promise and must be awaited before use). Runs three parallel
 * DB queries:
 *   - getRegulatoryEvents(filters) — sorted, filtered rows.
 *   - getDistinctMinistries()      — dynamic ministry filter vocabulary.
 *   - getDistinctTags()            — dynamic tag filter vocabulary.
 *
 * Passes the two vocabularies + the selected-lang to the client FilterBar
 * (which drives URL updates) and renders the result list below.
 *
 * Sort semantics: `getRegulatoryEvents` orders upcoming-first then
 * event_date DESC. This page splits the returned array into the "Coming up"
 * group (is_upcoming=TRUE) and the historical group, each rendered in its
 * own section.
 *
 * Year rail: a left-side year label appears above the FIRST card of each
 * calendar year within the historical list. Orphan-label suppression is
 * automatic because the label is rendered inline with the first card of
 * each year — if filters eliminate every card in a year, no label is emitted.
 *
 * Failure modes:
 *   - DB query throws → render inline error block (no crash boundary needed
 *     for v0.1 per T15 §3.6).
 *   - Filter matches zero rows → render the "No regulations match your
 *     filters." empty state with a Clear-all-filters link (T15 §3.5).
 */

import type { Metadata } from 'next';
import Link from 'next/link';

import { FilterBar } from '@/components/regulatory/FilterBar';
import { TimelineCard } from '@/components/regulatory/TimelineCard';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  getDistinctMinistries,
  getDistinctTags,
  getRegulatoryEvents,
  type RegulatoryEventRow,
} from '@/lib/queries/regulatory';

// T31 — BreadcrumbList JSON-LD for the regulatory timeline. Anchors crawlers
// (Home → Regulatory) and pairs with the per-event detail page schemas at
// `/regulatory/[slug]`.
const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {
      '@type': 'ListItem',
      position: 1,
      name: 'Home',
      item: 'https://karbonlens.com/',
    },
    {
      '@type': 'ListItem',
      position: 2,
      name: 'Regulatory timeline',
      item: 'https://karbonlens.com/regulatory',
    },
  ],
};

export const dynamic = 'force-dynamic';

// T26 — page-level metadata. Short title → "Regulatory · KarbonLens".
// Safe to co-exist with `export const dynamic` above (two separate named exports).
export const metadata: Metadata = {
  title: 'Regulatory',
  description:
    'Indonesian carbon-market regulations — bilingual summaries, importance and tags filter.',
  openGraph: {
    url: '/regulatory',
    title: 'Regulatory · KarbonLens',
    description:
      'Indonesian carbon-market regulations — bilingual summaries, importance and tags filter.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: "KarbonLens — Indonesia's carbon market, in one terminal",
      },
    ],
  },
  twitter: {
    title: 'Regulatory · KarbonLens',
    description:
      'Indonesian carbon-market regulations — bilingual summaries, importance and tags filter.',
    images: ['/og-image.png'],
  },
};

type SearchParamValue = string | string[] | undefined;
type SearchParams = Record<string, SearchParamValue>;

/**
 * Normalise a Next.js searchParams entry to a string[]. Next.js has already
 * URL-decoded the values — do NOT call decodeURIComponent on them (see the
 * T15 §7.4 double-decode warning).
 */
function asArray(v: SearchParamValue): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function asScalar(v: SearchParamValue): string | undefined {
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v[0] : v;
}

function getYear(iso: string): number {
  return Number(iso.slice(0, 4));
}

export default async function RegulatoryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const importance = asArray(sp.importance);
  const ministry = asArray(sp.ministry);
  const tag = asArray(sp.tag);
  const langParam = asScalar(sp.lang);
  const lang: 'en' | 'id' = langParam === 'id' ? 'id' : 'en';

  let events: RegulatoryEventRow[] = [];
  let ministries: string[] = [];
  let tags: string[] = [];
  let queryError: Error | null = null;

  try {
    [events, ministries, tags] = await Promise.all([
      getRegulatoryEvents({ importance, ministry, tag }),
      getDistinctMinistries(),
      getDistinctTags(),
    ]);
  } catch (err) {
    queryError = err instanceof Error ? err : new Error(String(err));
  }

  // Defensive data-integrity warning per T15 §7.1: historical rows with a
  // future event_date. Log once per render (server-side) — do NOT apply
  // Forecast styling based on date alone.
  if (!queryError) {
    const today = new Date().toISOString().slice(0, 10);
    for (const e of events) {
      if (!e.isUpcoming && e.eventDate > today) {
        // eslint-disable-next-line no-console
        console.warn(
          `regulatory_events row ${e.id}: event_date is in the future but is_upcoming=FALSE`,
        );
      }
    }
  }

  const upcoming = events.filter((e) => e.isUpcoming);
  const historical = events.filter((e) => !e.isUpcoming);

  const anyFilterActive =
    importance.length > 0 ||
    ministry.length > 0 ||
    tag.length > 0 ||
    lang !== 'en';

  return (
    <main className="kl-page">
      <JsonLd data={breadcrumbSchema} id="ld-breadcrumb" />
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">Regulatory timeline · Indonesia</p>
          <h1 className="kl-page-title">Regulatory</h1>
          <p className="kl-page-subtitle">
            Permenhut, Perpres, POJK, Kepmen, MoU, and IDXCarbon milestones
            affecting carbon-market operators.
          </p>
        </div>
        <div className="kl-page-actions">
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="kl-pill kl-pill--neutral"
            style={{
              border: 'none',
              cursor: 'not-allowed',
              opacity: 0.7,
            }}
          >
            Subscribe — coming soon
          </button>
        </div>
      </header>

      {queryError ? (
        <div
          role="alert"
          className="kl-card"
          style={{
            borderLeft: '4px solid var(--danger-fg)',
            background: 'var(--danger-bg)',
          }}
        >
          <p className="kl-section-label" style={{ marginBottom: 6 }}>
            Failed to load regulatory events
          </p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
            {queryError.message}
          </p>
        </div>
      ) : (
        <>
          <FilterBar ministries={ministries} tags={tags} />

          {events.length === 0 ? (
            <EmptyState anyFilterActive={anyFilterActive} />
          ) : (
            <>
              {upcoming.length > 0 ? (
                <section style={{ marginBottom: 32 }}>
                  <p className="kl-section-label">Coming up</p>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 12,
                    }}
                  >
                    {upcoming.map((e) => (
                      <TimelineCard key={e.id} event={e} lang={lang} />
                    ))}
                  </div>
                </section>
              ) : null}

              {historical.length > 0 ? (
                <section>
                  <p className="kl-section-label">Timeline</p>
                  <HistoricalList events={historical} lang={lang} />
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </main>
  );
}

function HistoricalList({
  events,
  lang,
}: {
  events: RegulatoryEventRow[];
  lang: 'en' | 'id';
}) {
  // Year rail: emit a year label above the first card of each new calendar
  // year. Because we iterate in descending event_date order, consecutive
  // rows within a year share a label; when the year changes, we emit a new
  // one. Years with zero cards (after filtering) never get a label — orphan
  // suppression is automatic.
  let lastYear: number | null = null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {events.map((e) => {
        const year = getYear(e.eventDate);
        const emitRail = year !== lastYear;
        lastYear = year;
        return (
          <div key={e.id} style={{ display: 'flex', gap: 16, position: 'relative' }}>
            <div
              aria-hidden="true"
              style={{
                width: 56,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                paddingTop: 4,
                position: 'relative',
              }}
            >
              {emitRail ? (
                <span
                  className="tnum"
                  style={{
                    fontFamily:
                      'var(--font-plex-mono), ui-monospace, monospace',
                    fontSize: 11,
                    color: 'var(--text-3)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    fontWeight: 500,
                  }}
                >
                  {year}
                </span>
              ) : null}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: 0,
                  borderLeft: '0.5px solid var(--border-strong)',
                }}
              />
            </div>
            <div style={{ flex: 1, paddingBottom: 12 }}>
              <TimelineCard event={e} lang={lang} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ anyFilterActive }: { anyFilterActive: boolean }) {
  return (
    <div
      className="kl-card"
      style={{
        textAlign: 'center',
        padding: '48px 24px',
      }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 15,
          color: 'var(--text)',
          marginBottom: 12,
        }}
      >
        {anyFilterActive
          ? 'No regulations match your filters.'
          : 'No regulations to show.'}
      </p>
      {anyFilterActive ? (
        <Link
          href="/regulatory"
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-plex-mono), ui-monospace, monospace',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
            color: 'var(--info-fg)',
            textDecoration: 'underline',
          }}
        >
          Clear all filters
        </Link>
      ) : null}
    </div>
  );
}
