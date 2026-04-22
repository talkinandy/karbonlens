import { readFileSync } from 'node:fs';
const env = readFileSync('.env.local', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}

const { getProjectAlertsFeatureCollection, ALERTS_MAP_LIMIT } = await import('./lib/queries/map-geojson.ts');
const postgres = (await import('postgres')).default;
const sql = postgres(process.env.DATABASE_URL, { max: 1 });

// Find projects with >5000 alerts in last 90 days
const rows = await sql`
  SELECT p.id, p.slug, p.name_canonical, COUNT(*) AS n
  FROM projects p
  JOIN satellite_alerts sa ON sa.project_id = p.id
  WHERE sa.alert_date >= CURRENT_DATE - INTERVAL '90 days'
  GROUP BY p.id, p.slug, p.name_canonical
  HAVING COUNT(*) > 5000
  ORDER BY n DESC
  LIMIT 5
`;
console.log('high-density projects (90d):', rows);

if (rows[0]) {
  const alerts = await getProjectAlertsFeatureCollection(rows[0].id);
  console.log('capped features:', alerts.features.length);
  console.log('properties:', JSON.stringify(alerts.properties));
  console.log('ALERTS_MAP_LIMIT:', ALERTS_MAP_LIMIT);
}
await sql.end();
