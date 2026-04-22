'use client';

/**
 * MapExplorerTabClient — `"use client"` shell that dynamically imports
 * the real MapLibre composition with `ssr: false`.
 *
 * Next 16's App Router rejects `dynamic(..., { ssr: false })` at the top
 * level of server components; the restriction applies only to server
 * modules, so this shell makes the dynamic import legal by living inside
 * a client-component file.
 *
 * The shell also renders a loading skeleton so pressing Tab → Map on a
 * cold cache shows a block-shape rather than a white flash while
 * MapLibre's bundle streams in.
 */

import dynamic from 'next/dynamic';
import type { CentroidCollection } from '@/lib/queries/map-geojson-types';
import type { MapExplorerTabProps } from './MapExplorerTab';

const MapExplorerTab = dynamic<MapExplorerTabProps>(
  () => import('./MapExplorerTab'),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        style={{
          width: '100%',
          height: '100%',
          background: 'var(--surface-2)',
        }}
        className="animate-pulse"
      />
    ),
  },
);

export function MapExplorerTabClient({
  features,
}: {
  features: CentroidCollection;
}) {
  return <MapExplorerTab features={features} />;
}
