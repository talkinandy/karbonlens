/**
 * lib/queries/map-geojson-types.ts — pure TS types + constants consumed by
 * both the server helpers in `map-geojson.ts` and the MapLibre client
 * components. Kept separate so the client bundle never drags in the
 * `db`/`postgres` runtime by following a type-only import chain.
 *
 * Ownership: T13.
 */

/**
 * Maximum alert points rendered per project detail map. See `map-geojson.ts`
 * for rationale. Exported here (not from `map-geojson.ts`) so client
 * components can reference the cap without pulling in server code.
 */
export const ALERTS_MAP_LIMIT = 5000;

export type CentroidProps = {
  slug: string;
  name: string;
  score: number | null;
};

export type AlertProps = {
  alertDate: string;
  confidence: 'high' | 'nominal' | 'low' | null;
  areaHa: number | null;
};

export type TruncationProps = {
  truncated: true;
  total: number;
} | null;

export type CentroidFeature = GeoJSON.Feature<GeoJSON.Point, CentroidProps>;
export type AlertFeature = GeoJSON.Feature<GeoJSON.Point, AlertProps>;
export type BufferFeature = GeoJSON.Feature<
  GeoJSON.Polygon,
  Record<string, never>
>;

export type CentroidCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  CentroidProps
>;

export type AlertCollection = GeoJSON.FeatureCollection<
  GeoJSON.Point,
  AlertProps
> & { properties?: TruncationProps };

export type BufferCollection = GeoJSON.FeatureCollection<
  GeoJSON.Polygon,
  Record<string, never>
>;
