/**
 * app/(public)/methodology/changelog/page.tsx — SEO Phase 2B (E-E-A-T).
 *
 * Append-only history of changes to the KarbonLens integrity-score
 * methodology. Closes the audit's E-E-A-T gap "Add /methodology/changelog —
 * version every weight change. Auditability = trust signal Google rewards."
 *
 * Each entry is hand-edited at the moment a methodology change ships.
 * Future weight changes append to the top of the array (newest first).
 * Whenever WEIGHTS in lib/score.ts changes, append an entry here and
 * update the version banner in /methodology to match.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { METHODOLOGY_VERSION, WEIGHTS } from '@/lib/score';

export const metadata: Metadata = {
  title: 'Methodology changelog',
  description:
    'Append-only version history of the KarbonLens integrity-score methodology — every weight change, threshold adjustment, and override addition.',
  openGraph: {
    url: '/methodology/changelog',
    title: 'Methodology changelog · KarbonLens',
    description:
      'Append-only version history of the KarbonLens integrity-score methodology — every weight change, threshold adjustment, and override addition.',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'KarbonLens methodology changelog' }],
  },
  twitter: {
    title: 'Methodology changelog · KarbonLens',
    description:
      'Append-only version history of the KarbonLens integrity-score methodology.',
    images: ['/og-image.png'],
  },
  alternates: { canonical: '/methodology/changelog' },
};

type ChangelogEntry = {
  version: string;
  date: string; // ISO YYYY-MM-DD
  status: 'released' | 'calibrating' | 'deprecated';
  summary: string;
  changes: string[];
};

// Newest entries at the top. Append, never edit released entries.
const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1',
    date: '2026-04-22',
    status: 'calibrating',
    summary:
      'Initial public release of the integrity-score framework. Composite of four sub-scores: reversal risk (35 %), validation recency (25 %), community flags (20 %), transparency (20 %).',
    changes: [
      `WEIGHTS established: reversal_risk=${WEIGHTS.reversal_risk}, validation_recency=${WEIGHTS.validation_recency}, community_flags=${WEIGHTS.community_flags}, transparency=${WEIGHTS.transparency}`,
      'Reversal-risk sub-score: 0–100 scale derived from GFW Integrated Alerts (RADD + GLAD-S2) intersected with the project polygon over the prior 90 days. Bucket thresholds documented at /methodology.',
      'Validation-recency sub-score: 0–100 scale derived from the time elapsed since the most recent third-party validation against the project methodology.',
      'Community-flags sub-score: hardcoded override list maintained in lib/score.ts (`COMMUNITY_OVERRIDES`). Projects publicly disputed by community organisations or covered by negative-precedent press coverage receive an override down to a floor value.',
      'Transparency sub-score: presence/recency of issuance, retirement, and methodology metadata across cross-referenced registries.',
      'Composite clamped to [0, 100]. Re-evaluated daily via the score-compute cron.',
    ],
  },
];

export default function MethodologyChangelogPage() {
  return (
    <main className="kl-page" aria-labelledby="changelog-h">
      <article style={{ maxWidth: 760, margin: '0 auto' }}>
        <header style={{ marginBottom: 32 }}>
          <p className="kl-section-label">
            <Link href="/methodology">← Methodology</Link>
          </p>
          <h1 id="changelog-h" className="kl-page-title">
            Methodology changelog
          </h1>
          <p className="kl-page-subtitle">
            Every change to the KarbonLens integrity-score weights, thresholds, and overrides
            is recorded here so any historical score can be traced back to the exact methodology
            version that produced it. Current methodology: <code>{METHODOLOGY_VERSION}</code>.
          </p>
        </header>

        {CHANGELOG.map((entry) => (
          <section
            key={entry.version}
            id={entry.version}
            style={{
              marginBottom: 32,
              paddingBottom: 24,
              borderBottom: '0.5px solid var(--border)',
            }}
          >
            <header
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 12,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <h2 style={{ fontSize: 22, margin: 0 }}>
                <code>{entry.version}</code>
              </h2>
              <span
                className={`kl-pill ${
                  entry.status === 'released'
                    ? 'kl-pill--success'
                    : entry.status === 'calibrating'
                      ? 'kl-pill--info'
                      : 'kl-pill--neutral'
                }`}
                style={{ fontSize: 11 }}
              >
                {entry.status}
              </span>
              <span style={{ color: 'var(--text-3)', fontSize: 13 }}>{entry.date}</span>
            </header>
            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 12 }}>{entry.summary}</p>
            <ul style={{ listStyle: 'disc', paddingLeft: 22, fontSize: 13, lineHeight: 1.6 }}>
              {entry.changes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </section>
        ))}

        <h2 style={{ fontSize: 18, marginTop: 32, marginBottom: 12 }}>How we version</h2>
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          The methodology follows a single integer version (<code>v1</code>, <code>v2</code>,
          …). A new major version is cut when any of the four <code>WEIGHTS</code> values,
          any sub-score bucket threshold, or the composite formula itself changes. Cosmetic
          adjustments (renaming a sub-score, refactoring code without changing numbers) do
          not bump the version.
        </p>
        <p style={{ fontSize: 14, lineHeight: 1.7 }}>
          Daily score recomputation writes the methodology version into{' '}
          <code>project_scores.components.methodology_version</code>, so historical scores
          remain traceable to the exact framework that produced them even after the live
          methodology has moved on.
        </p>

        <p
          className="kl-muted"
          style={{ marginTop: 32, fontSize: 12, color: 'var(--text-3)' }}
        >
          Source of truth for live weights:{' '}
          <code>lib/score.ts</code> · <code>scrapers/scoring/weights.py</code>.
        </p>
      </article>
    </main>
  );
}
