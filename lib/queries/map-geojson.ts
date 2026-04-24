/**
 * lib/queries/map-geojson.ts — T13 server-side GeoJSON helpers.
 *
 * PostGIS `geography(Point, 4326)` columns are opaque text through Drizzle's
 * `customType` (see `lib/schema.ts` — WKB hex). T13 reads them via
 * `ST_AsGeoJSON(col::geometry)::jsonb` and surfaces typed GeoJSON
 * FeatureCollections that the MapLibre client components consume as props.
 *
 * All three helpers run server-side only (they import `@/lib/db`, which
 * evaluates `process.env.DATABASE_URL`). Never import this module from a
 * component annotated with `"use client"`.
 *
 * Ownership: T13. Contract frozen in `docs/stories/T13-map-integration.md §3.8`.
 */
import type * as GeoJSON from 'geojson';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  ALERTS_MAP_LIMIT,
  type AlertCollection,
  type AlertFeature,
  type BufferCollection,
  type BufferFeature,
  type CentroidCollection,
  type CentroidFeature,
} from './map-geojson-types';

// Re-export the types + constant so existing importers of `map-geojson`
// (server callsites only) continue to work. Client components must import
// from `map-geojson-types` directly to avoid pulling in `db`/`postgres`.
export {
  ALERTS_MAP_LIMIT,
  type AlertCollection,
  type AlertFeature,
  type AlertProps,
  type BufferCollection,
  type BufferFeature,
  type CentroidCollection,
  type CentroidFeature,
  type CentroidProps,
  type TruncationProps,
} from './map-geojson-types';

/* -------------------------------------------------------------------------- */
/* getProjectCentroidsFeatureCollection                                       */
/* -------------------------------------------------------------------------- */

type CentroidRow = {
  slug: string;
  name: string;
  score: string | null;
  geometry: GeoJSON.Point;
};

/**
 * Returns a GeoJSON FeatureCollection of every project with a non-null
 * centroid. Each feature's `properties.score` is the latest `integrity_score`
 * from `project_scores` (ordered by `score_date DESC LIMIT 1`), or `null`
 * when no score row exists.
 *
 * Used by the explorer map tab (`/projects?tab=map`). Expected cardinality
 * for v0.1 is ≤64 features — the full payload is ≤6 KB, safe to embed in
 * the initial HTML.
 */
export async function getProjectCentroidsFeatureCollection(): Promise<CentroidCollection> {
  const rows = await db.execute<CentroidRow>(sql`
    SELECT
      p.slug AS slug,
      p.name_canonical AS name,
      ls.integrity_score AS score,
      ST_AsGeoJSON(p.centroid::geometry)::jsonb AS geometry
    FROM projects p
    LEFT JOIN LATERAL (
      SELECT ps.integrity_score
      FROM project_scores ps
      WHERE ps.project_id = p.id
      ORDER BY ps.score_date DESC
      LIMIT 1
    ) ls ON TRUE
    WHERE p.centroid IS NOT NULL
    ORDER BY p.slug
  `);

  const features: CentroidFeature[] = [];
  for (const row of rows) {
    if (!row.geometry || row.geometry.type !== 'Point') continue;
    const scoreNum =
      row.score === null || row.score === undefined ? null : Number(row.score);
    features.push({
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        slug: row.slug,
        name: row.name,
        score: Number.isFinite(scoreNum) ? (scoreNum as number) : null,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

/* -------------------------------------------------------------------------- */
/* getProjectAlertsFeatureCollection                                          */
/* -------------------------------------------------------------------------- */

type AlertRow = {
  alert_date: string;
  confidence: string | null;
  area_ha: string | null;
  geometry: GeoJSON.Point;
};

type CountRow = { total: string };

/**
 * Returns satellite alert points for a single project, capped at
 * `ALERTS_MAP_LIMIT`. Window defaults to the last 90 days (matches the T12
 * AlertsSummary window).
 *
 * When the uncapped count exceeds the cap, the FeatureCollection carries
 * `properties: { truncated: true, total: N }` so the UI can render a
 * "Showing 5,000 of N alerts" notice. Both the capped SELECT and the
 * `COUNT(*)` run concurrently via `Promise.all` to avoid an extra
 * round-trip.
 *
 * @throws if the projectId does not exist in `projects`.
 */
export async function getProjectAlertsFeatureCollection(
  projectId: string,
  days = 90,
): Promise<AlertCollection> {
  // Validate project exists — spec §3.8 requires throw on invalid id.
  const existsRows = await db.execute<{ one: number }>(sql`
    SELECT 1 AS one FROM projects WHERE id = ${projectId}::uuid LIMIT 1
  `);
  if (existsRows.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }

  const [rows, countRows] = await Promise.all([
    db.execute<AlertRow>(sql`
      SELECT
        TO_CHAR(alert_date, 'YYYY-MM-DD') AS alert_date,
        confidence,
        area_ha,
        ST_AsGeoJSON(location::geometry)::jsonb AS geometry
      FROM satellite_alerts
      WHERE project_id = ${projectId}::uuid
        AND alert_date >= CURRENT_DATE - (${days}::int || ' days')::interval
        AND location IS NOT NULL
      ORDER BY alert_date DESC
      LIMIT ${ALERTS_MAP_LIMIT}
    `),
    db.execute<CountRow>(sql`
      SELECT COUNT(*)::text AS total
      FROM satellite_alerts
      WHERE project_id = ${projectId}::uuid
        AND alert_date >= CURRENT_DATE - (${days}::int || ' days')::interval
        AND location IS NOT NULL
    `),
  ]);

  const total = Number(countRows[0]?.total ?? 0);

  const features: AlertFeature[] = [];
  for (const row of rows) {
    if (!row.geometry || row.geometry.type !== 'Point') continue;
    const conf = row.confidence;
    const confNorm: 'high' | 'nominal' | 'low' | null =
      conf === 'high' || conf === 'nominal' || conf === 'low' ? conf : null;
    const areaNum = row.area_ha === null ? null : Number(row.area_ha);
    features.push({
      type: 'Feature',
      geometry: row.geometry,
      properties: {
        alertDate: row.alert_date,
        confidence: confNorm,
        areaHa: Number.isFinite(areaNum) ? (areaNum as number) : null,
      },
    });
  }

  const collection: AlertCollection = {
    type: 'FeatureCollection',
    features,
  };

  if (total > ALERTS_MAP_LIMIT) {
    collection.properties = { truncated: true, total };
  }

  return collection;
}

/* -------------------------------------------------------------------------- */
/* getProjectCentroidCoords                                                   */
/* -------------------------------------------------------------------------- */

type CentroidCoordsRow = {
  geometry: GeoJSON.Point | null;
};

/**
 * Convenience helper: returns `[lon, lat]` for a single project, or null
 * when the project has no centroid (or the project does not exist).
 *
 * Used by the detail page to set MapLibre's initial `center` — avoids
 * parsing the WKB-hex `centroid` column the Drizzle customType exposes.
 */
export async function getProjectCentroidCoords(
  projectId: string,
): Promise<[number, number] | null> {
  const rows = await db.execute<CentroidCoordsRow>(sql`
    SELECT
      CASE
        WHEN centroid IS NULL THEN NULL
        ELSE ST_AsGeoJSON(centroid::geometry)::jsonb
      END AS geometry
    FROM projects
    WHERE id = ${projectId}::uuid
    LIMIT 1
  `);
  const geom = rows[0]?.geometry;
  if (!geom || geom.type !== 'Point') return null;
  const [lon, lat] = geom.coordinates;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return [lon, lat];
}

/* -------------------------------------------------------------------------- */
/* getProjectBufferFeatureCollection                                          */
/* -------------------------------------------------------------------------- */

type BufferRow = {
  geometry: GeoJSON.Polygon | null;
};

/**
 * Returns a single-feature FeatureCollection containing the project's
 * `buffer_km` buffer around its centroid. The buffer is computed in
 * degrees via `ST_Buffer(centroid::geometry, buffer_km * 1000 / 111320)`
 * — accurate to within ~2% at Indonesian latitudes (see T13 §7 edge cases).
 *
 * If the project has a NULL centroid, returns an empty FeatureCollection.
 *
 * @throws if the projectId does not exist in `projects`.
 */
export async function getProjectBufferFeatureCollection(
  projectId: string,
): Promise<BufferCollection> {
  const rows = await db.execute<BufferRow>(sql`
    SELECT
      CASE
        WHEN centroid IS NULL THEN NULL
        ELSE ST_AsGeoJSON(
          ST_Buffer(
            centroid::geometry,
            COALESCE(buffer_km, 10) * 1000.0 / 111320.0
          )
        )::jsonb
      END AS geometry
    FROM projects
    WHERE id = ${projectId}::uuid
    LIMIT 1
  `);

  if (rows.length === 0) {
    throw new Error(`Project ${projectId} not found`);
  }

  const geometry = rows[0].geometry;
  if (!geometry || geometry.type !== 'Polygon') {
    return { type: 'FeatureCollection', features: [] };
  }

  const feature: BufferFeature = {
    type: 'Feature',
    geometry,
    properties: {},
  };

  return { type: 'FeatureCollection', features: [feature] };
}
