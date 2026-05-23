/**
 * app/admin/seo/page.tsx — T31 admin-only SEO health dashboard.
 *
 * Server-rendered, no interactivity. Five cards on `.kl-page`:
 *
 *   1. Content inventory — counts + latest-ingest timestamps for the
 *      tables that drive public SEO surfaces (projects, descriptions,
 *      regulatory events, monthly snapshots, scores, satellite alerts).
 *   2. Freshness alerts — rows that should normally be 0. Anything
 *      non-zero is operator-actionable (stale scores, stale Claude
 *      descriptions per T30 runbook, missed `is_upcoming` flips).
 *   3. Refresh candidates (T33 Phase 4D-lite) — projects whose AI
 *      description should be regenerated, either because it is >90d
 *      old or because underlying facts changed after generated_at
 *      (stale input_fingerprint proxy). Auto-refresh cron deferred.
 *   4. Sitemap preview — server-side fetch of the public sitemap.xml
 *      with a 1h revalidate window. Counts <url>/<lastmod> via regex
 *      (no parser dependency).
 *   5. Indexation hints — three external operator links. The IndexNow
 *      manual-ping link is rendered as a disabled note (forward-ref
 *      to a future T31 Phase-4 route).
 *
 * Auth: enforced by both `proxy.ts` (matcher `/admin/:path*`) and the
 * parent `app/admin/layout.tsx`. The page-level `isAdmin(session)` check
 * is defence-in-depth — matches the brief's "admin gate at the top".
 *
 * Robots: `noindex, nofollow` so the dashboard never leaks into search
 * results even if proxy gating is misconfigured in some future deploy.
 */

import 'server-only';

import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { getSeoMetrics } from '@/lib/queries/seo-metrics';
import {
  getIndexationSnapshot,
  getBacklinksSummary,
  getTopKeywords,
  getPunchList,
  summarisePunchList,
  getContentCadence,
  type PunchListRow,
  type KeywordRankRow,
  type IndexationRow,
  type BacklinksSummary,
  type ContentCadence,
} from '@/lib/queries/seo/dashboard';
import type { SeoTaskPriority } from '@/lib/seo/plan';
import { updateSeoTaskStatus } from './punch-list-actions';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'SEO health',
  robots: { index: false, follow: false },
};

const SITEMAP_URL = 'https://karbonlens.com/sitemap.xml';

type SitemapStats = {
  ok: true;
  totalUrls: number;
  newestLastmod: Date | null;
  oldestLastmod: Date | null;
  oldestAgeDays: number | null;
};

type SitemapError = { ok: false; error: string };

async function fetchSitemapStats(): Promise<SitemapStats | SitemapError> {
  try {
    const res = await fetch(SITEMAP_URL, {
      next: { revalidate: 3600 },
      headers: { 'User-Agent': 'KarbonLensAdminDashboard/0.1' },
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    // Minimal regex parse — count opening <url> tags + collect lastmod values.
    const urlMatches = xml.match(/<url[\s>]/g) ?? [];
    const lastmodMatches = Array.from(
      xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g),
    );
    const dates: Date[] = [];
    for (const m of lastmodMatches) {
      const d = new Date(m[1].trim());
      if (!Number.isNaN(d.getTime())) dates.push(d);
    }
    if (dates.length === 0) {
      return {
        ok: true,
        totalUrls: urlMatches.length,
        newestLastmod: null,
        oldestLastmod: null,
        oldestAgeDays: null,
      };
    }
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const oldest = sorted[0];
    const newest = sorted[sorted.length - 1];
    const oldestAgeDays = Math.floor(
      (Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24),
    );
    return {
      ok: true,
      totalUrls: urlMatches.length,
      newestLastmod: newest,
      oldestLastmod: oldest,
      oldestAgeDays,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

function fmtIsoDate(d: Date | null): string {
  if (!d) return '—';
  return d.toISOString().slice(0, 10);
}

function fmtRelativeDays(d: Date | null): string {
  if (!d) return '';
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function StatRow({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '8px 0',
        borderBottom: '0.5px solid var(--border)',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--text-2)' }}>{label}</span>
      <span style={{ fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
        {value}
      </span>
    </div>
  );
}

function DateWithRelative({ d }: { d: Date | null }) {
  if (!d) {
    return <span style={{ color: 'var(--text-3)' }}>never</span>;
  }
  return (
    <>
      <span>{fmtIsoDate(d)}</span>
      <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 12 }}>
        ({fmtRelativeDays(d)})
      </span>
    </>
  );
}

export default async function SeoDashboardPage() {
  const session = await auth();
  if (!isAdmin(session)) {
    redirect('/');
  }

  const [metrics, sitemap, indexation, backlinks, topKeywords, punchList, cadence] =
    await Promise.all([
      getSeoMetrics(),
      fetchSitemapStats(),
      getIndexationSnapshot(),
      getBacklinksSummary(),
      getTopKeywords(),
      getPunchList(),
      getContentCadence(),
    ]);
  const punchSummary = summarisePunchList(punchList);

  const { contentInventory: inv, freshnessAlerts: fa } = metrics;
  const allFresh =
    fa.staleScores === 0 &&
    fa.staleDescriptions === 0 &&
    fa.missedUpcoming === 0;

  return (
    <main className="kl-page" aria-label="SEO health dashboard">
      <header className="kl-page-header" style={{ paddingTop: 16 }}>
        <div>
          <div className="kl-section-label">Admin — SEO</div>
          <h1 className="kl-page-title">SEO health</h1>
          <p className="kl-page-subtitle">
            Operator snapshot: content inventory, freshness alerts, and
            sitemap state. Cached for 1 hour where applicable.
          </p>
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
        }}
      >
        {/* ── Card 1: Content inventory ─────────────────────────────────── */}
        <section className="kl-card" aria-labelledby="seo-inventory-h">
          <div className="kl-section-label" id="seo-inventory-h">
            Content inventory
          </div>
          <div style={{ marginTop: 8 }}>
            <StatRow
              label="Total ID projects"
              value={inv.totalProjects.toLocaleString()}
            />
            <StatRow
              label="Projects with AI description"
              value={inv.projectsWithDescription.toLocaleString()}
            />
            <StatRow
              label="Regulatory events"
              value={inv.regulatoryEvents.toLocaleString()}
            />
            <StatRow
              label="Monthly price snapshots"
              value={inv.monthlyPriceSnapshots.toLocaleString()}
            />
            <StatRow
              label="Latest score compute"
              value={<DateWithRelative d={inv.latestScoreComputeAt} />}
            />
            <StatRow
              label="Latest satellite ingest"
              value={
                <DateWithRelative d={inv.latestSatelliteAlertIngestAt} />
              }
            />
          </div>
        </section>

        {/* ── Card 2: Freshness alerts ──────────────────────────────────── */}
        <section className="kl-card" aria-labelledby="seo-freshness-h">
          <div className="kl-section-label" id="seo-freshness-h">
            Freshness alerts
          </div>

          {allFresh ? (
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 13,
                color: 'var(--success-fg, var(--text-1))',
              }}
            >
              <span
                className="kl-pill kl-pill--success"
                style={{ marginRight: 8 }}
              >
                OK
              </span>
              All fresh — no operator action needed.
            </p>
          ) : (
            <div
              style={{
                marginTop: 8,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <FreshnessAlert
                count={fa.staleScores}
                pill={fa.staleScores > 0 ? 'danger' : 'success'}
                title="Stale integrity scores"
                example={fa.staleScoresExampleSlug}
                explanation="Projects whose latest score_date is >7 days old. The daily score-compute cron should keep this at 0."
              />
              <FreshnessAlert
                count={fa.staleDescriptions}
                pill={fa.staleDescriptions > 0 ? 'warning' : 'success'}
                title="Stale AI descriptions"
                example={fa.staleDescriptionExampleSlug}
                explanation="Descriptions generated >90 days ago — candidates for regeneration per the T30 runbook."
              />
              <FreshnessAlert
                count={fa.missedUpcoming}
                pill={fa.missedUpcoming > 0 ? 'danger' : 'success'}
                title="Missed upcoming flips"
                example={fa.missedUpcomingExampleTitle}
                explanation="Regulatory events still flagged is_upcoming=TRUE whose event_date is now in the past — should have been flipped to effective."
              />
            </div>
          )}
        </section>

        {/* ── Card 3: Refresh candidates (T33 Phase 4D-lite) ────────────── */}
        <section className="kl-card" aria-label="Refresh candidates">
          <div className="kl-section-label">Refresh candidates</div>
          {metrics.refreshCandidates.totalCandidates === 0 ? (
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 13,
                color: 'var(--success-fg, var(--text-1))',
              }}
            >
              <span
                className="kl-pill kl-pill--success"
                style={{ marginRight: 8 }}
              >
                OK
              </span>
              All project descriptions are current.
            </p>
          ) : (
            <>
              <div style={{ marginTop: 8 }}>
                <StatRow
                  label="Total candidates"
                  value={metrics.refreshCandidates.totalCandidates.toLocaleString()}
                />
                <StatRow
                  label="Old (> 90 days)"
                  value={metrics.refreshCandidates.oldDescriptions.toLocaleString()}
                />
                <StatRow
                  label="Stale fingerprint"
                  value={metrics.refreshCandidates.staleFingerprints.toLocaleString()}
                />
              </div>
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  marginTop: 16,
                  marginBottom: 6,
                }}
              >
                Top 10 (most stale first)
              </h3>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  fontSize: 13,
                }}
              >
                {metrics.refreshCandidates.examples.map((c) => (
                  <li
                    key={c.projectId}
                    style={{
                      padding: '6px 0',
                      borderBottom: '0.5px solid var(--border)',
                    }}
                  >
                    <a
                      href={`/projects/${c.slug}`}
                      style={{
                        color: 'var(--info-fg)',
                        textDecoration: 'none',
                      }}
                    >
                      {c.name}
                    </a>
                    {' — '}
                    <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                      {c.ageDays} days old · {c.reason.replace('_', ' ')}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-3)',
                  marginTop: 12,
                }}
              >
                Trigger regeneration per{' '}
                <a
                  href="/docs/runbooks/project-descriptions"
                  style={{ color: 'var(--text-2)' }}
                >
                  the T30 runbook
                </a>
                . Auto-refresh cron deferred to v0.2.
              </p>
            </>
          )}
        </section>

        {/* ── Card 4: Sitemap preview ───────────────────────────────────── */}
        <section className="kl-card" aria-labelledby="seo-sitemap-h">
          <div className="kl-section-label" id="seo-sitemap-h">
            Sitemap preview
          </div>
          {sitemap.ok ? (
            <div style={{ marginTop: 8 }}>
              <StatRow
                label="Total URLs"
                value={sitemap.totalUrls.toLocaleString()}
              />
              <StatRow
                label="Newest lastmod"
                value={<DateWithRelative d={sitemap.newestLastmod} />}
              />
              <StatRow
                label="Oldest lastmod"
                value={
                  <>
                    <DateWithRelative d={sitemap.oldestLastmod} />
                    {sitemap.oldestAgeDays !== null &&
                    sitemap.oldestAgeDays > 90 ? (
                      <span
                        className="kl-pill kl-pill--warning"
                        style={{ marginLeft: 8 }}
                      >
                        STALE
                      </span>
                    ) : null}
                  </>
                }
              />
              <p
                style={{
                  margin: '12px 0 0',
                  fontSize: 12,
                  color: 'var(--text-3)',
                }}
              >
                Source: <code>{SITEMAP_URL}</code> · cached 1h via
                Next.js fetch revalidate.
              </p>
            </div>
          ) : (
            <p
              style={{
                margin: '12px 0 0',
                fontSize: 13,
                color: 'var(--text-2)',
              }}
            >
              <span
                className="kl-pill kl-pill--danger"
                style={{ marginRight: 8 }}
              >
                ERR
              </span>
              Sitemap unreachable — check build. (
              <code>{sitemap.error}</code>)
            </p>
          )}
        </section>

        {/* ── Tile A: Indexation (SEO Phase 1) ──────────────────────────── */}
        <IndexationTile rows={indexation} />

        {/* ── Tile B: Backlinks (SEO Phase 1) ───────────────────────────── */}
        <BacklinksTile summary={backlinks} />

        {/* ── Tile C: Content cadence (SEO Phase 1) ─────────────────────── */}
        <ContentCadenceTile cadence={cadence} />

        {/* ── Tile D: Top keywords (SEO Phase 1) ────────────────────────── */}
        <TopKeywordsTile rows={topKeywords} />

        {/* ── Card 5: Indexation hints ──────────────────────────────────── */}
        <section className="kl-card" aria-labelledby="seo-indexation-h">
          <div className="kl-section-label" id="seo-indexation-h">
            Indexation hints
          </div>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: '8px 0 0',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              fontSize: 13,
            }}
          >
            <li>
              <a
                href="https://search.google.com/search-console?resource_id=https%3A%2F%2Fkarbonlens.com%2F"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Google Search Console →
              </a>
            </li>
            <li>
              <a
                href="https://www.bing.com/webmasters/home?siteUrl=https%3A%2F%2Fkarbonlens.com%2F"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Bing Webmaster Tools →
              </a>
            </li>
            <li
              style={{
                color: 'var(--text-3)',
                cursor: 'not-allowed',
                fontStyle: 'italic',
              }}
            >
              <span aria-disabled="true">
                Ping IndexNow manually (POST to
                {' '}<code>/api/admin/indexnow-ping</code>) — not yet
                implemented; forward-ref to T31 Phase-4.
              </span>
            </li>
          </ul>
        </section>
      </div>

      {/* ── Tile E: SEO punch list (full-width) ─────────────────────────── */}
      <section
        className="kl-card"
        aria-labelledby="seo-punch-h"
        style={{ marginTop: 16 }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div className="kl-section-label" id="seo-punch-h">
            SEO punch list
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            P0 {punchSummary.byPriority.P0.completed}/{punchSummary.byPriority.P0.total}
            {' · '}P1 {punchSummary.byPriority.P1.completed}/{punchSummary.byPriority.P1.total}
            {' · '}P2 {punchSummary.byPriority.P2.completed}/{punchSummary.byPriority.P2.total}
          </div>
        </div>
        <PunchListTable rows={punchList} />
      </section>
    </main>
  );
}

function FreshnessAlert({
  count,
  pill,
  title,
  example,
  explanation,
}: {
  count: number;
  pill: 'success' | 'warning' | 'danger';
  title: string;
  example: string | null;
  explanation: string;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span className={`kl-pill kl-pill--${pill}`}>
          {count.toLocaleString()}
        </span>
        <span>{title}</span>
      </div>
      {count > 0 && example ? (
        <div
          style={{
            margin: '4px 0 0 0',
            fontSize: 12,
            color: 'var(--text-2)',
          }}
        >
          e.g. <code>{example}</code>
        </div>
      ) : null}
      <p
        style={{
          margin: '4px 0 0',
          fontSize: 12,
          color: 'var(--text-3)',
          lineHeight: 1.4,
        }}
      >
        {explanation}
      </p>
    </div>
  );
}

// ─── SEO Phase 1 tiles ───────────────────────────────────────────────────────

function IndexationTile({ rows }: { rows: IndexationRow[] }) {
  const anyData = rows.some((r) => r.indexed !== null);
  return (
    <section className="kl-card" aria-labelledby="seo-indexation-tile-h">
      <div className="kl-section-label" id="seo-indexation-tile-h">
        Indexation
      </div>
      {!anyData ? (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          No data yet — wire <code>GSC_SERVICE_ACCOUNT_JSON_BASE64</code> and{' '}
          <code>BWT_API_KEY</code> per{' '}
          <a href="/docs/runbooks/seo-search-engine-onboarding" style={{ color: 'var(--text-2)' }}>
            the onboarding runbook
          </a>{' '}
          to populate this tile.
        </p>
      ) : (
        <div style={{ marginTop: 8 }}>
          {rows.map((r) => (
            <StatRow
              key={r.source}
              label={
                <span>
                  {r.source.toUpperCase()}
                  {r.observedAt ? (
                    <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 12 }}>
                      ({fmtRelativeDays(r.observedAt)})
                    </span>
                  ) : null}
                </span>
              }
              value={
                r.indexed === null ? (
                  <span style={{ color: 'var(--text-3)' }}>pending</span>
                ) : (
                  <span>
                    {r.indexed.toLocaleString()}
                    {r.submitted ? `/${r.submitted.toLocaleString()}` : null}
                    {r.delta7d !== null ? (
                      <span
                        style={{
                          color: r.delta7d > 0 ? 'var(--success-fg, var(--text-1))' : 'var(--text-3)',
                          marginLeft: 8,
                          fontSize: 12,
                        }}
                      >
                        {r.delta7d >= 0 ? '+' : ''}
                        {r.delta7d} / 7d
                      </span>
                    ) : null}
                  </span>
                )
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

function BacklinksTile({ summary }: { summary: BacklinksSummary }) {
  return (
    <section className="kl-card" aria-labelledby="seo-backlinks-h">
      <div className="kl-section-label" id="seo-backlinks-h">
        Backlinks
      </div>
      {summary.referringDomains === null || summary.referringDomains === 0 ? (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          No data yet — wire <code>AHREFS_WMT_TOKEN</code> in{' '}
          <code>scripts/seo/fetch-ahrefs.ts</code>.
        </p>
      ) : (
        <div style={{ marginTop: 8 }}>
          <StatRow
            label="Referring domains"
            value={summary.referringDomains.toLocaleString()}
          />
          <StatRow
            label="Total backlinks"
            value={(summary.totalBacklinks ?? 0).toLocaleString()}
          />
          {summary.newLast7d.length > 0 ? (
            <div style={{ marginTop: 8 }}>
              <div className="kl-section-label" style={{ fontSize: 12 }}>
                New / last 7d
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '6px 0 0', fontSize: 12 }}>
                {summary.newLast7d.map((b) => (
                  <li key={b.referringHost} style={{ color: 'var(--text-2)', padding: '2px 0' }}>
                    {b.referringHost}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {summary.lastFetched ? (
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>
              Last refresh: {fmtIsoDate(summary.lastFetched)} ({fmtRelativeDays(summary.lastFetched)})
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ContentCadenceTile({ cadence }: { cadence: ContentCadence }) {
  return (
    <section className="kl-card" aria-labelledby="seo-cadence-h">
      <div className="kl-section-label" id="seo-cadence-h">
        Content cadence
      </div>
      <div style={{ marginTop: 8 }}>
        <StatRow
          label="Last Market Wrap"
          value={
            cadence.lastMarketWrap ? (
              <a
                href={`/news/${cadence.lastMarketWrap.slug}`}
                style={{ color: 'var(--info-fg)', textDecoration: 'none' }}
              >
                {fmtIsoDate(cadence.lastMarketWrap.publishedAt)}
              </a>
            ) : (
              <span style={{ color: 'var(--text-3)' }}>never</span>
            )
          }
        />
        <StatRow
          label="Next Market Wrap"
          value={fmtIsoDate(cadence.nextMarketWrap)}
        />
        <StatRow
          label="Glossary entries"
          value={
            <span>
              {cadence.glossaryEntries}/{cadence.glossaryTarget}
              <span style={{ color: 'var(--text-3)', marginLeft: 8, fontSize: 12 }}>
                (P1-glossary-expand)
              </span>
            </span>
          }
        />
      </div>
    </section>
  );
}

function TopKeywordsTile({ rows }: { rows: KeywordRankRow[] }) {
  return (
    <section className="kl-card" aria-labelledby="seo-keywords-h">
      <div className="kl-section-label" id="seo-keywords-h">
        Top keywords (last 7d)
      </div>
      {rows.length === 0 ? (
        <p
          style={{
            margin: '12px 0 0',
            fontSize: 12,
            color: 'var(--text-3)',
          }}
        >
          No data yet — populated by <code>scripts/seo/fetch-gsc.ts</code> once
          GSC service account is configured.
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: '8px 0 0',
            fontSize: 13,
          }}
        >
          {rows.map((r) => (
            <li
              key={`${r.query}::${r.page}`}
              style={{
                padding: '6px 0',
                borderBottom: '0.5px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.query}
              </span>
              <span style={{ color: 'var(--text-3)', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                pos {r.positionLatest.toFixed(1)}
                {r.trend === 'up' ? ' ▲' : r.trend === 'down' ? ' ▼' : r.trend === 'new' ? ' ✦' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PunchListTable({ rows }: { rows: PunchListRow[] }) {
  const byPriority: Record<SeoTaskPriority, PunchListRow[]> = { P0: [], P1: [], P2: [] };
  for (const r of rows) byPriority[r.priority].push(r);

  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {(['P0', 'P1', 'P2'] as SeoTaskPriority[]).map((p) =>
        byPriority[p].length === 0 ? null : (
          <div key={p}>
            <div
              className="kl-section-label"
              style={{ fontSize: 12, marginBottom: 6 }}
            >
              {p}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {byPriority[p].map((r) => (
                <PunchListRowView key={r.code} row={r} />
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  );
}

function PunchListRowView({ row }: { row: PunchListRow }) {
  const done = row.status === 'completed' || row.status === 'wontfix';
  return (
    <li
      style={{
        padding: '8px 0',
        borderBottom: '0.5px solid var(--border)',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 12,
        alignItems: 'baseline',
        fontSize: 13,
      }}
    >
      <form action={updateSeoTaskStatus}>
        <input type="hidden" name="code" value={row.code} />
        <input
          type="hidden"
          name="status"
          value={done ? 'pending' : 'completed'}
        />
        <button
          type="submit"
          aria-label={done ? `Reopen ${row.code}` : `Mark ${row.code} done`}
          style={{
            width: 16,
            height: 16,
            border: '1px solid var(--border)',
            borderRadius: 3,
            background: done ? 'var(--info-fg)' : 'transparent',
            cursor: 'pointer',
            padding: 0,
            color: 'white',
            fontSize: 11,
            lineHeight: '14px',
          }}
        >
          {done ? '✓' : ''}
        </button>
      </form>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: done ? 'var(--text-3)' : 'var(--text-1)',
            textDecoration: done ? 'line-through' : 'none',
          }}
        >
          <code style={{ color: 'var(--text-3)', marginRight: 8 }}>{row.code}</code>
          {row.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {row.description}
          {row.closedAt ? (
            <span style={{ marginLeft: 8 }}>
              · closed {fmtIsoDate(row.closedAt)}
              {row.closedBy ? ` by ${row.closedBy}` : ''}
            </span>
          ) : null}
        </div>
      </div>
      <span
        className={`kl-pill ${
          done
            ? 'kl-pill--success'
            : row.status === 'in_progress'
              ? 'kl-pill--info'
              : 'kl-pill--neutral'
        }`}
        style={{ fontSize: 11 }}
      >
        {row.kind}
      </span>
    </li>
  );
}
