/**
 * ScoreCard — integrity score card (#score anchor).
 *
 * Composite numeric + quality label + four sub-score bars with role="progressbar"
 * ARIA semantics and a numeric text label. `components` is the
 * `project_scores.components` JSONB shape owned by T09.
 */

import type { ScoreComponents } from '@/lib/score';

type Props = {
  integrityScore: number | null;
  scoreDate: string | null;
  components: ScoreComponents | null;
};

const SUBSCORE_ROWS: Array<{
  key: keyof Omit<ScoreComponents, 'inputs'>;
  label: string;
}> = [
  { key: 'validation_recency', label: 'Validation & verification' },
  { key: 'reversal_risk', label: 'Reversal risk (inverse)' },
  { key: 'community_flags', label: 'Community & benefit-sharing' },
  { key: 'transparency', label: 'Transparency & disclosure' },
];

function qualityLabel(score: number): string {
  if (score >= 75) return 'High quality';
  if (score >= 60) return 'Moderate';
  return 'Watch closely';
}

function fillClass(value: number): string {
  if (value >= 75) return 'success';
  if (value >= 60) return 'info';
  return 'warning';
}

export function ScoreCard({ integrityScore, scoreDate, components }: Props) {
  if (integrityScore === null || components === null) {
    return (
      <section id="score" style={{ marginBottom: 32 }}>
        <p className="kl-section-label">Integrity score</p>
        <div className="kl-card">
          <p className="kl-page-subtitle">
            Score not yet computed for this project.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section id="score" style={{ marginBottom: 32 }}>
      <p className="kl-section-label">Integrity score</p>
      <div className="kl-card">
        <div style={{ marginBottom: 16 }}>
          <span className="kl-stat-value tnum">
            {integrityScore}
            <span className="text-3" style={{ fontSize: 16, marginLeft: 4 }}>
              / 100
            </span>
          </span>
          <p className="kl-stat-delta">{qualityLabel(integrityScore)}</p>
        </div>

        <div>
          {SUBSCORE_ROWS.map(({ key, label }) => {
            const rawValue = components[key];
            const hasValue = typeof rawValue === 'number';
            const value = hasValue ? rawValue : 0;
            const klass = fillClass(value);
            return (
              <div key={key}>
                <div className="score-row">
                  <span className="score-row-label">{label}</span>
                  <span className="score-row-value">
                    {hasValue ? `${value}/100` : '—'}
                  </span>
                </div>
                <div className="score-track">
                  <div
                    className={`score-fill ${klass}`}
                    role="progressbar"
                    aria-valuenow={value}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`${label}: ${hasValue ? `${value} out of 100` : 'unknown'}`}
                    style={{ width: `${value}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {scoreDate && (
          <p
            className="kl-muted"
            style={{ fontStyle: 'italic', fontSize: 11, marginTop: 8 }}
          >
            v1 methodology, calibrating. Last computed {scoreDate}.
          </p>
        )}
      </div>
    </section>
  );
}
