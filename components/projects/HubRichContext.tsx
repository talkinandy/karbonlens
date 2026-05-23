/**
 * components/projects/HubRichContext.tsx — SEO Phase 2D.
 *
 * Renders the data-derived "context paragraph + stats grid + methodology
 * mix" block that thickens province and methodology hub-slug pages.
 * Shared so both hubs get the same shape and we don't repeat the
 * paragraph-generation logic in two routes.
 *
 * The block sits between the hub header (heading + count) and the
 * project table — it's the SEO surface that lifts hub pages from
 * "skeleton + table" (the audit's complaint, 89KB) toward parity with
 * project detail pages (218KB).
 */

import Link from 'next/link';
import type { HubStats } from '@/lib/queries/projects-by';

type Kind = 'province' | 'methodology';

function fmtIntK(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toLocaleString('en-US');
}

function plural(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? singular + 's');
}

/**
 * Compose a 1-2 sentence narrative summary from the stats. Deterministic;
 * same inputs always produce the same prose so Google sees consistent
 * content across crawls.
 */
function buildProvinceParagraph(canonical: string, stats: HubStats): string {
  if (stats.projectCount === 0) {
    return `No tracked Indonesian carbon projects are currently registered in ${canonical}. As Verra and SRN-PPI add new ${canonical}-based registrations, they will appear here automatically.`;
  }
  const parts: string[] = [];
  const noun = plural(stats.projectCount, 'project');
  const dominantMeth =
    stats.topMethodologies[0]?.code && stats.topMethodologies[0].count > 0
      ? stats.topMethodologies[0].code
      : null;
  const hectares = stats.totalHectares != null ? Math.round(stats.totalHectares) : null;
  parts.push(
    `${canonical} hosts ${stats.projectCount} tracked Indonesian carbon ${noun}${
      hectares ? `, covering ${fmtIntK(hectares)} hectares of project area` : ''
    }${dominantMeth ? ` and dominated by ${dominantMeth} methodology` : ''}.`,
  );
  if (stats.alertsLast90d != null && stats.alertsLast90d > 0) {
    parts.push(
      `Satellite monitoring recorded ${stats.alertsLast90d.toLocaleString('en-US')} ${plural(
        stats.alertsLast90d,
        'alert',
      )} inside project polygons over the last 90 days.`,
    );
  }
  const topDev = stats.topDevelopers[0];
  if (topDev) {
    parts.push(
      `Leading project developer in the slice: ${topDev.name} (${topDev.count} ${plural(
        topDev.count,
        'project',
      )}).`,
    );
  }
  return parts.join(' ');
}

function buildMethodologyParagraph(code: string, stats: HubStats): string {
  if (stats.projectCount === 0) {
    return `No Indonesian projects are currently registered under ${code}. New registrations will appear here automatically as they land in the Verra or SRN-PPI registries.`;
  }
  const parts: string[] = [];
  const noun = plural(stats.projectCount, 'project');
  const hectares = stats.totalHectares != null ? Math.round(stats.totalHectares) : null;
  parts.push(
    `${stats.projectCount} tracked Indonesian carbon ${noun} use ${code}${
      hectares ? `, covering ${fmtIntK(hectares)} hectares of project area` : ''
    }.`,
  );
  if (stats.totalIssuanceCredits != null && stats.totalIssuanceCredits > 0) {
    parts.push(
      `Cumulative issuable credits across the slice: ${fmtIntK(
        stats.totalIssuanceCredits,
      )} tCO₂e.`,
    );
  }
  const topProv = stats.topProvinces?.[0];
  if (topProv) {
    parts.push(
      `Province distribution is led by ${topProv.canonical} (${topProv.count} ${plural(
        topProv.count,
        'project',
      )}).`,
    );
  }
  if (stats.alertsLast90d != null && stats.alertsLast90d > 0) {
    parts.push(
      `Satellite monitoring recorded ${stats.alertsLast90d.toLocaleString('en-US')} ${plural(
        stats.alertsLast90d,
        'alert',
      )} inside slice polygons over the last 90 days.`,
    );
  }
  return parts.join(' ');
}

export function HubRichContext({
  kind,
  label,
  slug,
  stats,
}: {
  kind: Kind;
  /** Province canonical or methodology code, used in prose + headings. */
  label: string;
  /** Slug used to render cross-link URLs (e.g. methodology code 'vm0007'). */
  slug: string;
  stats: HubStats;
}) {
  if (stats.projectCount === 0) return null;

  const paragraph =
    kind === 'province'
      ? buildProvinceParagraph(label, stats)
      : buildMethodologyParagraph(label, stats);

  // For methodology pages, link the code to its glossary entry if one exists.
  // For province pages, link to the by-methodology hub for the dominant code.
  const crossLinks =
    kind === 'methodology'
      ? [
          { label: 'Methodology in glossary', href: `/glossary/${slug.toLowerCase()}` },
          ...(stats.topProvinces ?? []).slice(0, 2).map((p) => ({
            label: `Projects in ${p.canonical}`,
            href: `/projects/by-province/${p.canonical
              .toLowerCase()
              .replace(/&/g, 'and')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')}`,
          })),
        ]
      : stats.topMethodologies.slice(0, 3).map((m) => ({
          label: `${m.code} projects`,
          href: `/projects/by-methodology/${m.code
            .toLowerCase()
            .replace(/\./g, '-')}`,
        }));

  return (
    <section
      aria-label="Hub context"
      style={{
        marginBottom: 28,
        background: 'var(--surface-2, transparent)',
        padding: '20px 0',
        borderTop: '0.5px solid var(--border)',
        borderBottom: '0.5px solid var(--border)',
      }}
    >
      <p
        style={{
          fontSize: 14,
          lineHeight: 1.7,
          marginBottom: 16,
          maxWidth: 720,
        }}
      >
        {paragraph}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 14,
          marginBottom: 16,
        }}
      >
        <Stat label="Projects" value={stats.projectCount.toLocaleString('en-US')} />
        {stats.totalHectares !== null ? (
          <Stat label="Hectares" value={fmtIntK(Math.round(stats.totalHectares))} />
        ) : null}
        {stats.totalIssuanceCredits !== null ? (
          <Stat
            label="Credits issued"
            value={fmtIntK(stats.totalIssuanceCredits) + ' tCO₂e'}
          />
        ) : null}
        {stats.alertsLast90d !== null ? (
          <Stat
            label="Alerts · last 90d"
            value={stats.alertsLast90d.toLocaleString('en-US')}
          />
        ) : null}
      </div>

      {kind === 'province' && stats.topMethodologies.length > 0 ? (
        <div style={{ marginBottom: 12 }}>
          <p
            className="kl-section-label"
            style={{ fontSize: 11, marginBottom: 6 }}
          >
            Methodology mix
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              fontSize: 12,
            }}
          >
            {stats.topMethodologies.map((m) => (
              <li
                key={m.code}
                style={{
                  border: '0.5px solid var(--border)',
                  padding: '2px 8px',
                  borderRadius: 3,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Link
                  href={`/projects/by-methodology/${m.code.toLowerCase().replace(/\./g, '-')}`}
                  style={{ color: 'inherit', textDecoration: 'none' }}
                >
                  {m.code} <span style={{ color: 'var(--text-3)' }}>· {m.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {crossLinks.length > 0 ? (
        <div>
          <p
            className="kl-section-label"
            style={{ fontSize: 11, marginBottom: 6 }}
          >
            Related hubs
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexWrap: 'wrap',
              gap: 12,
              fontSize: 13,
            }}
          >
            {crossLinks.map((cl) => (
              <li key={cl.href}>
                <Link href={cl.href} style={{ color: 'var(--info-fg)' }}>
                  {cl.label} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="kl-section-label"
        style={{ fontSize: 11, marginBottom: 2 }}
      >
        {label}
      </p>
      <p
        style={{
          fontSize: 22,
          fontWeight: 500,
          margin: 0,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
    </div>
  );
}
