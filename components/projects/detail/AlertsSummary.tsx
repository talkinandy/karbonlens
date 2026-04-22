/**
 * AlertsSummary — satellite-alerts card (#alerts anchor).
 *
 * Also emits the map section as a sibling `<section id="map">` immediately
 * below the card. T12 shipped a placeholder inside that section; T13
 * replaces its inner contents via the optional `mapSlot` prop. The
 * `<section id="map">` element itself is preserved — do not rename or
 * remove it.
 *
 * The "View all alerts" link uses `?project={slug}` (not `{id}`) per T16 spec
 * — T16 resolves slug → UUID server-side.
 */

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { AlertSummary } from '@/lib/queries/project-detail';

type Props = {
  alerts: AlertSummary;
  slug: string;
  /**
   * T13 injects the MapLibre client component here. When null/undefined the
   * original T12 placeholder renders (used only if the project has no
   * centroid).
   */
  mapSlot?: ReactNode;
};

export function AlertsSummary({ alerts, slug, mapSlot }: Props) {
  return (
    <>
      <section id="alerts" style={{ marginBottom: 16 }}>
        <p className="kl-section-label">Satellite alerts (last 90 days)</p>
        <div className="kl-card">
          <div className="kl-stat-grid" style={{ marginBottom: 16 }}>
            <div>
              <p className="kl-stat-label">Total</p>
              <p className="kl-stat-value tnum">
                {alerts.total90d.toLocaleString('en-ID')}
              </p>
            </div>
            <div>
              <p className="kl-stat-label">High confidence</p>
              <p className="kl-stat-value tnum">
                {alerts.highConf.toLocaleString('en-ID')}
              </p>
            </div>
            <div>
              <p className="kl-stat-label">Nominal confidence</p>
              <p className="kl-stat-value tnum">
                {alerts.nominalConf.toLocaleString('en-ID')}
              </p>
            </div>
          </div>
          <Link href={`/alerts?project=${slug}`} className="kl-link">
            View all alerts for this project →
          </Link>
        </div>
      </section>

      <section
        id="map"
        aria-label="Project map"
        style={{ marginBottom: 32 }}
      >
        {mapSlot ?? (
          <div className="kl-map-placeholder">
            No location data available for this project.
          </div>
        )}
      </section>
    </>
  );
}
