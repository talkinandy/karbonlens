// READ-ONLY in v0.1. Do NOT run `drizzle-kit generate` or `drizzle-kit push` —
// migrations are applied via `psql -f scrapers/migrations/*.sql` and those
// files are authoritative. This config exists solely so `drizzle-kit
// introspect` can round-trip the live schema as an advisory sanity check
// during development. See T04 §3 and §7(x).

import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
