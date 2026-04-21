/**
 * lib/db.ts — Singleton Drizzle client for KarbonLens v0.1.
 *
 * Connectivity model (Andy override per T04 §3):
 *   - Local dev + v0.1 production: DATABASE_URL points at localhost:5432.
 *     Postgres is on the same Hetzner box as the Next.js server; no public
 *     exposure, no SSL tunnel, no Netlify-to-VPS bridge.
 *   - Netlify production connectivity (Tailscale vs thin proxy vs platform
 *     migration) is deferred to v0.2 — see T04 OQ-1.
 *
 * TODO v0.2: switch DATABASE_URL to sslmode=require once the VPS is reachable
 * from a serverless compute target.
 *
 * Pool sizing: `max: 10` suits a single-process VPS. Netlify/Vercel serverless
 * should drop to 2–3 to avoid exhausting Postgres `max_connections`.
 */

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Add it to .env.local.');
}

const client = postgres(connectionString, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
