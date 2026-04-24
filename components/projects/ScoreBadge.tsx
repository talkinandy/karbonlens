/**
 * ScoreBadge — small colored pill showing the integrity score (0–100).
 *
 * Buckets mirror `app/globals.css` chart tokens and the
 * `/methodology` page explanation:
 *   ≥ 80 → teal (strong)     — success-fg
 *   60–79 → blue (adequate)  — info-fg
 *   40–59 → amber (watch)    — warning-fg
 *   < 40 → red (poor)        — danger-fg
 *   null → grey (unknown)    — text-3 / neutral pill
 *
 * Renders as a 36×24px pill so rows stay visually dense.
 */

type Props = {
  score: string | null;
};

function bucket(n: number): 'success' | 'info' | 'warning' | 'danger' {
  if (n >= 80) return 'success';
  if (n >= 60) return 'info';
  if (n >= 40) return 'warning';
  return 'danger';
}

export function ScoreBadge({ score }: Props) {
  if (score === null || score === '') {
    return <span className="kl-score-badge kl-score-badge--neutral">—</span>;
  }
  const n = Number(score);
  if (!Number.isFinite(n)) {
    return <span className="kl-score-badge kl-score-badge--neutral">—</span>;
  }
  const rounded = Math.round(n);
  const tone = bucket(rounded);
  return (
    <span
      className={`kl-score-badge kl-score-badge--${tone}`}
      aria-label={`Integrity score ${rounded} out of 100`}
    >
      {rounded}
    </span>
  );
}
