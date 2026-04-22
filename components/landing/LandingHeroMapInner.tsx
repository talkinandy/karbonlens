'use client';

/**
 * LandingHeroMapInner — the MapLibre composition for the landing hero.
 *
 * Centred on Katingan Peatland (~[113.2, -1.8]) at zoom 9 with Esri World
 * Imagery, a 10 km buffer, and the last-90-day satellite alerts layer. Alert
 * clusters only appear at zoom < 8; at the landing's zoom 9 we render
 * individual points.
 *
 * Also accepts a centroid feature and renders it via ProjectCentroidLayer so
 * the Katingan point is visible above the Esri raster.
 *
 * Must only be reached via `next/dynamic` with `ssr: false` — `maplibre-gl`
 * touches `window` at module scope. See `LandingHeroMap.tsx`.
 */

import MapLibreBase from '@/components/map/MapLibreBase';
import EsriBaseLayer from '@/components/map/EsriBaseLayer';
import SatelliteAlertsLayer from '@/components/map/SatelliteAlertsLayer';
import ProjectCentroidLayer from '@/components/map/ProjectCentroidLayer';
import type {
  AlertCollection,
  BufferCollection,
  CentroidCollection,
  CentroidFeature,
} from '@/lib/queries/map-geojson-types';

export type LandingHeroMapInnerProps = {
  center: [number, number];
  zoom: number;
  centroid?: CentroidFeature;
  alerts: AlertCollection;
  buffer?: BufferCollection;
};

export default function LandingHeroMapInner({
  center,
  zoom,
  centroid,
  alerts,
  buffer,
}: LandingHeroMapInnerProps) {
  const centroidCollection: CentroidCollection | undefined = centroid
    ? {
        type: 'FeatureCollection',
        features: [centroid],
      }
    : undefined;

  return (
    <MapLibreBase
      center={center}
      zoom={zoom}
      ariaLabel="Live satellite map of Katingan Peatland"
      className="kl-map relative w-full rounded-[var(--radius-lg)] overflow-hidden"
    >
      <EsriBaseLayer />
      <SatelliteAlertsLayer alerts={alerts} buffer={buffer} />
      {centroidCollection ? (
        <ProjectCentroidLayer features={centroidCollection} />
      ) : null}
    </MapLibreBase>
  );
}
