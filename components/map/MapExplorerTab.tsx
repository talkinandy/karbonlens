'use client';

/**
 * MapExplorerTab — explorer-page map composition.
 *
 * Mounts MapLibreBase centered on Indonesia (via `fitBounds`) and layers
 * the Esri basemap + project centroids on top. This is the component the
 * server `app/(app)/projects/page.tsx` dynamically imports with
 * `ssr: false` when `searchParams.tab === 'map'`.
 *
 * Props arrive already fetched server-side via
 * `getProjectCentroidsFeatureCollection()`.
 */

import MapLibreBase from './MapLibreBase';
import EsriBaseLayer from './EsriBaseLayer';
import ProjectCentroidLayer from './ProjectCentroidLayer';
import type { CentroidCollection } from '@/lib/queries/map-geojson-types';

export type MapExplorerTabProps = {
  features: CentroidCollection;
};

// Indonesia bounding box — roughly Aceh → Papua.
const INDONESIA_BOUNDS: [[number, number], [number, number]] = [
  [95, -11],
  [141, 6],
];

export default function MapExplorerTab({ features }: MapExplorerTabProps) {
  return (
    <MapLibreBase
      center={[118, -2]}
      zoom={4}
      fitBounds={INDONESIA_BOUNDS}
      ariaLabel="Satellite map of Indonesian carbon projects"
      className="relative w-full rounded-md overflow-hidden"
    >
      <EsriBaseLayer />
      <ProjectCentroidLayer features={features} />
    </MapLibreBase>
  );
}
