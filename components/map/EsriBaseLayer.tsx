'use client';

/**
 * EsriBaseLayer — raster basemap sourced from Esri World Imagery.
 *
 * Tiles are public and unauthenticated (no API key). Attribution is
 * visible (non-compact) per HANDOFF.md § "Map (T13 visual rules)".
 * The `raster-saturation: -0.15` paint nudges the UI toward the
 * prototype's slightly-desaturated satellite look without the cost of
 * an off-screen canvas filter.
 *
 * Must be a direct child of `<MapLibreBase>` so `useMapContext()`
 * resolves.
 */

import { useEffect } from 'react';
import { useMapContext } from './MapLibreBase';

const ESRI_TILE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_ATTRIBUTION =
  'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics';
const SOURCE_ID = 'esri-world-imagery';
const LAYER_ID = 'esri-world-imagery-layer';

export default function EsriBaseLayer() {
  const { map } = useMapContext();

  useEffect(() => {
    if (map.getSource(SOURCE_ID)) return;

    map.addSource(SOURCE_ID, {
      type: 'raster',
      tiles: [ESRI_TILE_URL],
      tileSize: 256,
      attribution: ESRI_ATTRIBUTION,
    });

    map.addLayer({
      id: LAYER_ID,
      type: 'raster',
      source: SOURCE_ID,
      paint: {
        'raster-saturation': -0.15,
      },
    });

    return () => {
      // Guard: during client-side navigation the parent MapLibreBase may
      // have already called `map.remove()` (sync teardown nukes internal
      // maps before children unmount). Swallow cleanup errors.
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // map already destroyed — nothing to clean up
      }
    };
  }, [map]);

  return null;
}
