'use client';

/**
 * ProjectCentroidLayer — draws every project with a centroid as a 10 px
 * circle whose fill is bucketed on the latest integrity score.
 *
 * Popup on click:
 *   - project name
 *   - "Score: 74" (or "Score: —" when null)
 *   - "View detail →" link to `/projects/[slug]`
 *
 * Score buckets match HANDOFF.md § "Map (T13 visual rules)":
 *   ≥ 80 → chart-teal (success)
 *   60–79 → chart-blue (info)
 *   40–59 → chart-amber (warn)
 *   < 40 → chart-red (danger)
 *   null → text-3 (neutral)
 */

import { useEffect } from 'react';
import type * as GeoJSON from 'geojson';
import maplibregl from 'maplibre-gl';
import { useMapContext } from './MapLibreBase';
import type { CentroidCollection } from '@/lib/queries/map-geojson-types';

type Props = {
  features: CentroidCollection;
};

const SOURCE_ID = 'project-centroids';
const LAYER_ID = 'project-centroids-layer';

// Hex equivalents of the CSS custom properties in `app/globals.css`.
// Read at module scope so MapLibre's paint expressions (which are strings
// evaluated by a WebGL shader, not CSS) can be embedded directly.
const COLOR_TEAL = '#1d9e75'; // --chart-teal, score ≥ 80
const COLOR_BLUE = '#378add'; // --chart-blue, 60–79
const COLOR_AMBER = '#ba7517'; // --chart-amber, 40–59
const COLOR_RED = '#e24b4a'; // --chart-red, < 40
const COLOR_NEUTRAL = '#888780'; // --text-3
const STROKE = '#1a1a1a'; // --text

export default function ProjectCentroidLayer({ features }: Props) {
  const { map } = useMapContext();

  useEffect(() => {
    if (map.getSource(SOURCE_ID)) {
      // Hot-update when the prop changes — cheap, avoids teardown flicker.
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource;
      src.setData(features as GeoJSON.FeatureCollection);
      return;
    }

    map.addSource(SOURCE_ID, {
      type: 'geojson',
      data: features as GeoJSON.FeatureCollection,
    });

    map.addLayer({
      id: LAYER_ID,
      type: 'circle',
      source: SOURCE_ID,
      paint: {
        'circle-radius': 6,
        'circle-stroke-width': 1,
        'circle-stroke-color': STROKE,
        'circle-color': [
          'case',
          ['==', ['get', 'score'], null],
          COLOR_NEUTRAL,
          ['>=', ['get', 'score'], 80],
          COLOR_TEAL,
          ['>=', ['get', 'score'], 60],
          COLOR_BLUE,
          ['>=', ['get', 'score'], 40],
          COLOR_AMBER,
          COLOR_RED,
        ],
      },
    });

    // Click → popup with name + score + detail link.
    const onClick = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const { slug, name, score } = feat.properties as {
        slug: string;
        name: string;
        score: number | null;
      };
      const scoreText =
        score === null || score === undefined
          ? '—'
          : String(Math.round(Number(score)));
      const coords = feat.geometry.coordinates.slice() as [number, number];

      const html = `
        <div style="font-family: inherit; font-size: 13px;">
          <div style="font-weight: 600; margin-bottom: 4px; color: #1a1a1a;">
            ${escapeHtml(name)}
          </div>
          <div style="color: #5f5e5a; margin-bottom: 8px;">Score: ${escapeHtml(
            scoreText,
          )}</div>
          <a href="/projects/${encodeURIComponent(
            slug,
          )}" style="color: #378add; text-decoration: none;">View detail →</a>
        </div>
      `;

      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    };

    const onEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', LAYER_ID, onClick);
    map.on('mouseenter', LAYER_ID, onEnter);
    map.on('mouseleave', LAYER_ID, onLeave);

    return () => {
      // Guard: parent MapLibreBase may have already destroyed `map` during
      // client-side nav. Swallow cleanup errors.
      try {
        map.off('click', LAYER_ID, onClick);
        map.off('mouseenter', LAYER_ID, onEnter);
        map.off('mouseleave', LAYER_ID, onLeave);
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
      } catch {
        // map already destroyed
      }
    };
  }, [map, features]);

  return null;
}

/** Minimal HTML escape — popups are built from DB strings we don't fully trust. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
