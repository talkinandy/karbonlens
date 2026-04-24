'use client';

/**
 * ProjectDetailMap — detail-page map composition.
 *
 * Mounts MapLibreBase centered on the project's centroid at zoom 10
 * (~30 km field of view) and layers Esri + buffer + alerts. All inputs
 * are fetched server-side; this component only consumes GeoJSON props.
 */

import MapLibreBase from './MapLibreBase';
import EsriBaseLayer from './EsriBaseLayer';
import SatelliteAlertsLayer from './SatelliteAlertsLayer';
import type {
  AlertCollection,
  BufferCollection,
} from '@/lib/queries/map-geojson-types';

export type ProjectDetailMapProps = {
  centroid: [number, number];
  projectName: string;
  alerts: AlertCollection;
  buffer: BufferCollection;
};

export default function ProjectDetailMap({
  centroid,
  projectName,
  alerts,
  buffer,
}: ProjectDetailMapProps) {
  return (
    <MapLibreBase
      center={centroid}
      zoom={10}
      ariaLabel={`Satellite map of ${projectName}`}
      className="relative w-full h-[50vh] md:h-[60vh] rounded-md overflow-hidden"
    >
      <EsriBaseLayer />
      <SatelliteAlertsLayer alerts={alerts} buffer={buffer} />
    </MapLibreBase>
  );
}
