/**
 * app/admin/seo/page.tsx — T31 admin-only SEO health dashboard.
 *
 * Server-rendered, no interactivity. Four cards on `.kl-page`:
 *
 *   1. Content inventory — counts + latest-ingest timestamps for the
 *      tables that drive public SEO surfaces (projects, descriptions,
 *      regulatory events, monthly snapshots, scores, satellite alerts).
 *   2. Freshness alerts — rows that should normally be 0. Anything
 *      non-zero is operator-actionable (stale scores, stale Claude
 *      descriptions per T30 runbook, missed `is_upcoming` flips).
 *   3. Sitemap preview — server-side fetch of the public sitemap.xml
 *      with a 1h revalidate window. Counts <url>/<lastmod> via regex
 *      (no parser dependency).
 *   4. Indexation hints — three external operator links. The IndexNow
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
  label: string;
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

  const [metrics, sitemap] = await Promise.all([
    getSeoMetrics(),
    fetchSitemapStats(),
  ]);

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

        {/* ── Card 3: Sitemap preview ───────────────────────────────────── */}
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

        {/* ── Card 4: Indexation hints ──────────────────────────────────── */}
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
