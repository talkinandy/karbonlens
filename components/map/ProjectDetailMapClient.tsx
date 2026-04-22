'use client';

/**
 * ProjectDetailMapClient — `"use client"` shell that dynamically imports
 * the detail-page MapLibre composition with `ssr: false`, same pattern as
 * MapExplorerTabClient. Rationale identical (Next 16 disallows ssr:false
 * dynamic imports inside server components).
 *
 * Also renders the "Showing 5,000 of N alerts" truncation notice below the
 * map when the `AlertCollection` carries `properties.truncated`.
 */

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ALERTS_MAP_LIMIT,
  type AlertCollection,
  type BufferCollection,
} from '@/lib/queries/map-geojson-types';
import type { ProjectDetailMapProps } from './ProjectDetailMap';

const ProjectDetailMap = dynamic<ProjectDetailMapProps>(
  () => import('./ProjectDetailMap'),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '60vh',
          minHeight: 360,
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius-md)',
        }}
        className="animate-pulse"
      />
    ),
  },
);

export function ProjectDetailMapClient({
  centroid,
  projectName,
  projectSlug,
  alerts,
  buffer,
}: {
  centroid: [number, number];
  projectName: string;
  projectSlug: string;
  alerts: AlertCollection;
  buffer: BufferCollection;
}) {
  const truncated = alerts.properties?.truncated === true;
  const total = alerts.properties?.total ?? alerts.features.length;

  return (
    <>
      <ProjectDetailMap
        centroid={centroid}
        projectName={projectName}
        alerts={alerts}
        buffer={buffer}
      />
      {truncated ? (
        <p
          className="kl-muted"
          style={{ fontSize: 12, marginTop: 8 }}
          data-testid="map-alerts-truncation"
        >
          Showing {ALERTS_MAP_LIMIT.toLocaleString('en-ID')} of{' '}
          {total.toLocaleString('en-ID')} alerts —{' '}
          <Link
            href={`/alerts?project=${encodeURIComponent(projectSlug)}`}
            className="kl-link"
          >
            see all in alerts inbox
          </Link>
        </p>
      ) : null}
    </>
  );
}
