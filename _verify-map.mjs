import { readFileSync } from 'node:fs';
const env = readFileSync('/root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-a52d4079/.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const {
  getProjectCentroidsFeatureCollection,
  getProjectAlertsFeatureCollection,
  getProjectBufferFeatureCollection,
  getProjectCentroidCoords,
  ALERTS_MAP_LIMIT,
} = await import('/root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-a52d4079/lib/queries/map-geojson.ts');

const postgres = (await import('postgres')).default;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

const centroids = await getProjectCentroidsFeatureCollection();
console.log('centroids count:', centroids.features.length);
console.log('first centroid:', JSON.stringify(centroids.features[0]));

const pj = await sql`SELECT id, slug, name_canonical FROM projects WHERE slug = 'mangrove-restoration-and-coastal-greenbelt-aceh-n-sumatra' LIMIT 1`;
console.log('mangrove:', pj[0]?.slug, pj[0]?.id);
if (pj[0]) {
  const alerts = await getProjectAlertsFeatureCollection(pj[0].id);
  console.log('mangrove alerts features:', alerts.features.length, 'properties:', JSON.stringify(alerts.properties));
  const buf = await getProjectBufferFeatureCollection(pj[0].id);
  console.log('buffer features:', buf.features.length);
  const coords = await getProjectCentroidCoords(pj[0].id);
  console.log('mangrove centroid:', coords);
}

const kpj = await sql`SELECT id FROM projects WHERE slug = 'katingan-peatland-restoration-and-conservation-project' LIMIT 1`;
if (kpj[0]) {
  const alerts = await getProjectAlertsFeatureCollection(kpj[0].id);
  console.log('katingan alerts:', alerts.features.length, 'truncated:', alerts.properties?.truncated ?? false);
}

console.log('ALERTS_MAP_LIMIT:', ALERTS_MAP_LIMIT);
await sql.end();
process.exit(0);
