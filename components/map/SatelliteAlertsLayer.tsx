'use client';

/**
 * SatelliteAlertsLayer — project detail map's alert points.
 *
 * Two layers per the audited spec (§3.5):
 *   - `alerts-clusters` — cluster circles visible only at zoom < 8, sized by
 *     `point_count` with a `--border-strong` outline. Click → easeTo with
 *     the MapLibre `getClusterExpansionZoom` pattern.
 *   - `alerts-points` — individual points visible at zoom ≥ 8, color-coded
 *     by confidence. Click → popup with date, confidence, area.
 *
 * Also renders an optional buffer polygon (single-feature FeatureCollection)
 * as two layers: fill + outline. Buffer layer IDs are added before the
 * alert layers so alerts draw on top.
 *
 * MapLibre's built-in `cluster: true` GeoJSON source uses supercluster
 * internally, so no JS-side cluster code is needed.
 */

import { useEffect } from 'react';
import maplibregl from 'maplibre-gl';
import { useMapContext } from './MapLibreBase';
import type {
  AlertCollection,
  BufferCollection,
} from '@/lib/queries/map-geojson-types';

type Props = {
  alerts: AlertCollection;
  buffer?: BufferCollection;
};

const ALERTS_SOURCE = 'alerts';
const CLUSTER_LAYER = 'alerts-clusters';
const CLUSTER_COUNT_LAYER = 'alerts-cluster-count';
const POINT_LAYER = 'alerts-points';
const BUFFER_SOURCE = 'project-buffer';
const BUFFER_FILL_LAYER = 'project-buffer-fill';
const BUFFER_OUTLINE_LAYER = 'project-buffer-outline';

const CLUSTER_ZOOM_MAX = 8; // Clusters visible below this zoom.

// Hex tokens mirror app/globals.css.
const COLOR_HIGH = '#e24b4a'; // --chart-red
const COLOR_NOMINAL = '#ba7517'; // --chart-amber
const COLOR_LOW = '#888780'; // --text-3
const COLOR_BLUE = '#378add'; // --chart-blue (buffer)
const COLOR_SURFACE = '#ffffff'; // --surface (cluster bg)
const COLOR_BORDER_STRONG = 'rgba(0,0,0,0.14)'; // --border-strong

export default function SatelliteAlertsLayer({ alerts, buffer }: Props) {
  const { map } = useMapContext();

  useEffect(() => {
    // ── Buffer (drawn first so alerts stack above) ─────────────────────────
    if (buffer && buffer.features.length > 0) {
      if (!map.getSource(BUFFER_SOURCE)) {
        map.addSource(BUFFER_SOURCE, {
          type: 'geojson',
          data: buffer as GeoJSON.FeatureCollection,
        });
        map.addLayer({
          id: BUFFER_FILL_LAYER,
          type: 'fill',
          source: BUFFER_SOURCE,
          paint: {
            'fill-color': COLOR_BLUE,
            'fill-opacity': 0.1,
          },
        });
        map.addLayer({
          id: BUFFER_OUTLINE_LAYER,
          type: 'line',
          source: BUFFER_SOURCE,
          paint: {
            'line-color': COLOR_BLUE,
            'line-width': 1,
          },
        });
      } else {
        (map.getSource(BUFFER_SOURCE) as maplibregl.GeoJSONSource).setData(
          buffer as GeoJSON.FeatureCollection,
        );
      }
    }

    // ── Alerts source ──────────────────────────────────────────────────────
    if (!map.getSource(ALERTS_SOURCE)) {
      map.addSource(ALERTS_SOURCE, {
        type: 'geojson',
        data: alerts as GeoJSON.FeatureCollection,
        cluster: true,
        clusterRadius: 40,
        // Only cluster at lower zooms — setting clusterMaxZoom to 7 means at
        // zoom ≥ 8 the source returns unclustered points.
        clusterMaxZoom: CLUSTER_ZOOM_MAX - 1,
      });

      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: ALERTS_SOURCE,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': COLOR_SURFACE,
          'circle-stroke-color': COLOR_BORDER_STRONG,
          'circle-stroke-width': 0.5,
          'circle-radius': [
            'step',
            ['get', 'point_count'],
            12,
            10,
            16,
            50,
            20,
            200,
            26,
          ],
        },
      });

      // Cluster count badge — rendered as a symbol layer.
      // MapLibre will happily render text without glyphs by falling back to
      // the system font when `text-font` references a font not in the style;
      // we provide a sane default so future style upgrades don't regress.
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: ALERTS_SOURCE,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-size': 11,
          'text-allow-overlap': true,
          'text-ignore-placement': true,
        },
        paint: {
          'text-color': '#1a1a1a',
        },
      });

      map.addLayer({
        id: POINT_LAYER,
        type: 'circle',
        source: ALERTS_SOURCE,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': 2.5,
          'circle-color': [
            'case',
            ['==', ['get', 'confidence'], 'high'],
            COLOR_HIGH,
            ['==', ['get', 'confidence'], 'nominal'],
            COLOR_NOMINAL,
            COLOR_LOW,
          ],
          'circle-stroke-width': 0,
        },
      });
    } else {
      (map.getSource(ALERTS_SOURCE) as maplibregl.GeoJSONSource).setData(
        alerts as GeoJSON.FeatureCollection,
      );
    }

    // ── Cluster click: zoom in ────────────────────────────────────────────
    const onClusterClick = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feats = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER],
      });
      const cluster = feats[0];
      if (!cluster || cluster.geometry.type !== 'Point') return;
      const clusterId = cluster.properties?.cluster_id as number | undefined;
      if (clusterId === undefined) return;
      const source = map.getSource(ALERTS_SOURCE) as maplibregl.GeoJSONSource;
      source.getClusterExpansionZoom(clusterId).then((zoom) => {
        const coords = cluster.geometry.type === 'Point'
          ? (cluster.geometry.coordinates.slice() as [number, number])
          : null;
        if (coords) {
          map.easeTo({ center: coords, zoom });
        }
      }).catch(() => {
        /* ignore — stale cluster id */
      });
    };

    // ── Point click: popup with date / confidence / area ─────────────────
    const onPointClick = (
      e: maplibregl.MapMouseEvent & {
        features?: maplibregl.MapGeoJSONFeature[];
      },
    ) => {
      const feat = e.features?.[0];
      if (!feat || feat.geometry.type !== 'Point') return;
      const { alertDate, confidence, areaHa } = feat.properties as {
        alertDate: string;
        confidence: string | null;
        areaHa: number | null;
      };
      const coords = feat.geometry.coordinates.slice() as [number, number];
      const color =
        confidence === 'high'
          ? COLOR_HIGH
          : confidence === 'nominal'
            ? COLOR_NOMINAL
            : COLOR_LOW;
      const areaText =
        typeof areaHa === 'number' && Number.isFinite(areaHa)
          ? `${areaHa.toFixed(2)} ha`
          : '—';

      const html = `
        <div style="font-family: inherit; font-size: 12px;">
          <div style="margin-bottom: 4px;">
            <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color}; margin-right: 6px;"></span>
            <strong style="color: #1a1a1a;">${escapeHtml(alertDate)}</strong>
          </div>
          <div style="color: #5f5e5a;">Confidence: ${escapeHtml(confidence ?? 'unknown')}</div>
          <div style="color: #5f5e5a;">Area: ${escapeHtml(areaText)}</div>
        </div>
      `;

      new maplibregl.Popup({ closeButton: true, closeOnClick: true })
        .setLngLat(coords)
        .setHTML(html)
        .addTo(map);
    };

    const onClusterEnter = () => {
      map.getCanvas().style.cursor = 'pointer';
    };
    const onClusterLeave = () => {
      map.getCanvas().style.cursor = '';
    };

    map.on('click', CLUSTER_LAYER, onClusterClick);
    map.on('click', POINT_LAYER, onPointClick);
    map.on('mouseenter', CLUSTER_LAYER, onClusterEnter);
    map.on('mouseleave', CLUSTER_LAYER, onClusterLeave);
    map.on('mouseenter', POINT_LAYER, onClusterEnter);
    map.on('mouseleave', POINT_LAYER, onClusterLeave);

    return () => {
      map.off('click', CLUSTER_LAYER, onClusterClick);
      map.off('click', POINT_LAYER, onPointClick);
      map.off('mouseenter', CLUSTER_LAYER, onClusterEnter);
      map.off('mouseleave', CLUSTER_LAYER, onClusterLeave);
      map.off('mouseenter', POINT_LAYER, onClusterEnter);
      map.off('mouseleave', POINT_LAYER, onClusterLeave);

      [
        POINT_LAYER,
        CLUSTER_COUNT_LAYER,
        CLUSTER_LAYER,
        BUFFER_OUTLINE_LAYER,
        BUFFER_FILL_LAYER,
      ].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      [ALERTS_SOURCE, BUFFER_SOURCE].forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });
    };
  }, [map, alerts, buffer]);

  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
