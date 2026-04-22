/**
 * lib/queries/match-queue.ts — T21 match-queue admin page data loaders.
 *
 * Owns the read path for `app/admin/queue/page.tsx`. Two helpers:
 *
 *   - `getPendingQueueRows()` — list view; filters `status = 'pending'`.
 *   - `getQueueRow(id)`       — detail fetch used by the three POST routes
 *                               (approve / reject / defer) to render inline
 *                               error messages and to populate `admin_actions`
 *                               audit payloads.
 *
 * Both helpers return the two candidate project summaries side-by-side,
 * including an aggregated `registryNames` array (the list of registries each
 * candidate is known under). We use Drizzle's query builder for the project-row
 * joins and drop to the `sql` tag only for `array_agg` on the registries side.
 *
 * Numeric columns come back from Drizzle / postgres-js as strings. We pass
 * them through unchanged — the admin UI formats them at render time.
 */

import 'server-only';

import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export type QueueStatus = 'pending' | 'approved' | 'rejected' | 'deferred';

export type QueueProjectSummary = {
  id: string;
  slug: string;
  nameCanonical: string;
  developer: string | null;
  methodology: string | null;
  hectares: string | null;
  province: string | null;
  status: string | null;
  totalVcusIssued: string | null;
  registryNames: string[];
};

export type QueueRowWithProjects = {
  queueId: string;
  similarity: string | null; // numeric → string
  matchReason: string | null;
  createdAt: Date;
  status: QueueStatus;
  projectA: QueueProjectSummary;
  projectB: QueueProjectSummary;
};

type RawRow = {
  queue_id: string;
  similarity: string | null;
  match_reason: string | null;
  status: string;
  created_at: Date;
  a_id: string | null;
  a_slug: string | null;
  a_name: string | null;
  a_developer: string | null;
  a_methodology: string | null;
  a_hectares: string | null;
  a_province: string | null;
  a_status: string | null;
  a_total_vcus: string | null;
  a_registries: string[] | null;
  b_id: string | null;
  b_slug: string | null;
  b_name: string | null;
  b_developer: string | null;
  b_methodology: string | null;
  b_hectares: string | null;
  b_province: string | null;
  b_status: string | null;
  b_total_vcus: string | null;
  b_registries: string[] | null;
};

const SELECT_SQL = sql`
  SELECT
    pmq.id            AS queue_id,
    pmq.similarity    AS similarity,
    pmq.match_reason  AS match_reason,
    pmq.status        AS status,
    pmq.created_at    AS created_at,
    pa.id             AS a_id,
    pa.slug           AS a_slug,
    pa.name_canonical AS a_name,
    pa.developer      AS a_developer,
    pa.methodology    AS a_methodology,
    pa.hectares       AS a_hectares,
    pa.province       AS a_province,
    pa.status         AS a_status,
    pa.total_vcus_issued AS a_total_vcus,
    (
      SELECT array_agg(DISTINCT r.registry_name ORDER BY r.registry_name)
      FROM registries r
      WHERE r.project_id = pa.id
    ) AS a_registries,
    pb.id             AS b_id,
    pb.slug           AS b_slug,
    pb.name_canonical AS b_name,
    pb.developer      AS b_developer,
    pb.methodology    AS b_methodology,
    pb.hectares       AS b_hectares,
    pb.province       AS b_province,
    pb.status         AS b_status,
    pb.total_vcus_issued AS b_total_vcus,
    (
      SELECT array_agg(DISTINCT r.registry_name ORDER BY r.registry_name)
      FROM registries r
      WHERE r.project_id = pb.id
    ) AS b_registries
  FROM project_match_queue pmq
  LEFT JOIN projects pa ON pa.id = pmq.candidate_a_id
  LEFT JOIN projects pb ON pb.id = pmq.candidate_b_id
`;

function shape(r: RawRow): QueueRowWithProjects {
  return {
    queueId: r.queue_id,
    similarity: r.similarity,
    matchReason: r.match_reason,
    status: (r.status as QueueStatus) ?? 'pending',
    createdAt: r.created_at,
    projectA: {
      id: r.a_id ?? '',
      slug: r.a_slug ?? '',
      nameCanonical: r.a_name ?? '(deleted)',
      developer: r.a_developer,
      methodology: r.a_methodology,
      hectares: r.a_hectares,
      province: r.a_province,
      status: r.a_status,
      totalVcusIssued: r.a_total_vcus,
      registryNames: r.a_registries ?? [],
    },
    projectB: {
      id: r.b_id ?? '',
      slug: r.b_slug ?? '',
      nameCanonical: r.b_name ?? '(deleted)',
      developer: r.b_developer,
      methodology: r.b_methodology,
      hectares: r.b_hectares,
      province: r.b_province,
      status: r.b_status,
      totalVcusIssued: r.b_total_vcus,
      registryNames: r.b_registries ?? [],
    },
  };
}

export async function getPendingQueueRows(): Promise<QueueRowWithProjects[]> {
  const result = await db.execute<RawRow>(sql`
    ${SELECT_SQL}
    WHERE pmq.status = 'pending'
    ORDER BY pmq.created_at DESC
  `);
  // postgres-js execute returns an array-like. Normalize.
  const rows = Array.isArray(result) ? result : (result as unknown as RawRow[]);
  return rows.map(shape);
}

export async function getQueueRow(
  id: string,
): Promise<QueueRowWithProjects | null> {
  const result = await db.execute<RawRow>(sql`
    ${SELECT_SQL}
    WHERE pmq.id = ${id}
    LIMIT 1
  `);
  const rows = Array.isArray(result) ? result : (result as unknown as RawRow[]);
  if (rows.length === 0) return null;
  return shape(rows[0]);
}
