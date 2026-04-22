/**
 * lib/queries/landing-map.ts — server-only Drizzle helpers for the landing
 * hero map (T25).
 *
 * Pulls the Katingan Peatland centroid, a 10 km buffer polygon, and the
 * last-90-day satellite alerts (integrated-alerts superset; NOT filtered by
 * alert_source = 'RADD' — the scraper writes 'INTEGRATED'). Alerts are capped
 * at 200 for landing-page payload size; the exact pre-cap count is returned
 * separately for the hero caption.
 *
 * Ownership: T25. Only imported from `app/(public)/page.tsx` and
 * `components/landing/LandingHeroMap.tsx` (via server-fetched props). Must
 * not be imported from client components.
 *
 * Failure mode: the entire body is wrapped in try/catch. On error it returns
 * `{ katinganCentroid: undefined, katinganBuffer: undefined, alerts: empty,
 * katinganAlerts90d: 0 }`. The hero map falls back to an `<img>` via the
 * `MapErrorBoundary` in `LandingHeroMap.tsx`; the caption renders "0".
 */

import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';
import type * as GeoJSON from 'geojson';
import type {
  AlertCollection,
  BufferCollection,
  CentroidFeature,
} from './map-geojson-types';
import { FEATURED_SLUGS } from './landing-stats';

// Katingan slug is the first entry in FEATURED_SLUGS — keep in sync.
const KATINGAN_SLUG = FEATURED_SLUGS[0];

const LANDING_ALERTS_LIMIT = 200;

export type LandingMapData = {
  katinganCentroid: CentroidFeature | undefined;
  katinganBuffer: BufferCollection | undefined;
  alerts: AlertCollection;
  katinganAlerts90d: number;
};

type CentroidRow = {
  id: string;
  slug: string;
  name_canonical: string;
  integrity_score: string | number | null;
  geometry: GeoJSON.Point | null;
  buffer: GeoJSON.Polygon | null;
};

type AlertRow = {
  alert_date: string;
  confidence: string | null;
  area_ha: string | number | null;
  geometry: GeoJSON.Point | null;
};

type CountRow = { total: string | number };

function emptyAlerts(): AlertCollection {
  return { type: 'FeatureCollection', features: [] };
}

export async function getLandingMapData(): Promise<LandingMapData> {
  try {
    const centroidRows = await db.execute<CentroidRow>(sql`
      SELECT
        p.id::text                                      AS id,
        p.slug                                          AS slug,
        p.name_canonical                                AS name_canonical,
        ps.integrity_score                              AS integrity_score,
        CASE
          WHEN p.centroid IS NULL THEN NULL
          ELSE ST_AsGeoJSON(p.centroid::geometry)::jsonb
        END                                             AS geometry,
        CASE
          WHEN p.centroid IS NULL THEN NULL
          ELSE ST_AsGeoJSON(
            ST_Buffer(p.centroid::geography, 10000)::geometry
          )::jsonb
        END                                             AS buffer
      FROM projects p
      LEFT JOIN LATERAL (
        SELECT integrity_score
        FROM project_scores
        WHERE project_id = p.id
        ORDER BY score_date DESC
        LIMIT 1
      ) ps ON TRUE
      WHERE p.slug = ${KATINGAN_SLUG}
      LIMIT 1
    `);

    const row = centroidRows[0];
    if (!row) {
      return {
        katinganCentroid: undefined,
        katinganBuffer: undefined,
        alerts: emptyAlerts(),
        katinganAlerts90d: 0,
      };
    }

    const projectId = row.id;

    const [alertsRows, countRows] = await Promise.all([
      db.execute<AlertRow>(sql`
        SELECT
          alert_date::text                              AS alert_date,
          confidence                                    AS confidence,
          area_ha                                       AS area_ha,
          ST_AsGeoJSON(location::geometry)::jsonb       AS geometry
        FROM satellite_alerts
        WHERE project_id = ${projectId}::uuid
          AND alert_date >= CURRENT_DATE - INTERVAL '90 days'
          AND location IS NOT NULL
        ORDER BY alert_date DESC
        LIMIT ${LANDING_ALERTS_LIMIT}
      `),
      db.execute<CountRow>(sql`
        SELECT COUNT(*)::text AS total
        FROM satellite_alerts
        WHERE project_id = ${projectId}::uuid
          AND alert_date >= CURRENT_DATE - INTERVAL '90 days'
          AND location IS NOT NULL
      `),
    ]);

    // Centroid feature
    let katinganCentroid: CentroidFeature | undefined;
    if (row.geometry && row.geometry.type === 'Point') {
      const score =
        row.integrity_score === null || row.integrity_score === undefined
          ? null
          : Number(row.integrity_score);
      katinganCentroid = {
        type: 'Feature',
        geometry: row.geometry,
        properties: {
          slug: row.slug,
          name: row.name_canonical,
          score: Number.isFinite(score as number) ? (score as number) : null,
        },
      };
    }

    // Buffer
    let katinganBuffer: BufferCollection | undefined;
    if (row.buffer && row.buffer.type === 'Polygon') {
      katinganBuffer = {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: row.buffer,
            properties: {},
          },
        ],
      };
    }

    // Alerts
    const alertFeatures: AlertCollection['features'] = [];
    for (const a of alertsRows) {
      if (!a.geometry || a.geometry.type !== 'Point') continue;
      const conf = a.confidence;
      const confNorm: 'high' | 'nominal' | 'low' | null =
        conf === 'high' || conf === 'nominal' || conf === 'low' ? conf : null;
      const areaNum =
        a.area_ha === null || a.area_ha === undefined
          ? null
          : Number(a.area_ha);
      alertFeatures.push({
        type: 'Feature',
        geometry: a.geometry,
        properties: {
          alertDate: a.alert_date,
          confidence: confNorm,
          areaHa: Number.isFinite(areaNum as number) ? (areaNum as number) : null,
        },
      });
    }
    const alerts: AlertCollection = {
      type: 'FeatureCollection',
      features: alertFeatures,
    };

    const total = Number(countRows[0]?.total ?? 0);

    return {
      katinganCentroid,
      katinganBuffer,
      alerts,
      katinganAlerts90d: Number.isFinite(total) ? total : 0,
    };
  } catch (err) {
    console.error('[T25] getLandingMapData error:', err);
    return {
      katinganCentroid: undefined,
      katinganBuffer: undefined,
      alerts: emptyAlerts(),
      katinganAlerts90d: 0,
    };
  }
}
