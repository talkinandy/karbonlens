/**
 * SectionHero — top of the project detail page.
 *
 * Renders: breadcrumb, H1, subtitle (developer · province · hectares), and a
 * right-aligned status pill derived via `displayStatus()`/`badgePillClass()`
 * (T11-owned helpers in `lib/display/status.ts`).
 */

import Link from 'next/link';
import {
  badgePillClass,
  displayStatus,
} from '@/lib/display/status';

type Props = {
  name: string;
  developer: string | null;
  province: string | null;
  hectares: string | null;
  status: string | null;
  registryNames: string[];
};

export function SectionHero({
  name,
  developer,
  province,
  hectares,
  status,
  registryNames,
}: Props) {
  const subtitleParts = [
    developer ?? '—',
    province ?? '—',
    hectares ? `${Number(hectares).toLocaleString('en-ID')} ha` : '— ha',
  ];

  const badge = displayStatus(status);

  return (
    <header className="kl-page-header">
      <div>
        <p className="kl-section-label">
          <Link href="/projects">← Projects</Link>
          {registryNames.length > 0 &&
            registryNames.map((n) => (
              <span key={n}>
                {' · '}
                <span className="kl-pill kl-pill--neutral">{n}</span>
              </span>
            ))}
        </p>
        <h1 className="kl-page-title">{name}</h1>
        <p className="kl-page-subtitle">{subtitleParts.join(' · ')}</p>
      </div>
      <div className="kl-page-actions">
        <span className={`kl-pill ${badgePillClass(badge.badge)}`}>
          {badge.label}
        </span>
      </div>
    </header>
  );
}
