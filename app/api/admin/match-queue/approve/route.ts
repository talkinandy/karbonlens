/**
 * POST /api/admin/match-queue/approve — T21 approve (merge) handler.
 *
 * Performs the 11-step atomic merge transaction. The queue row is locked
 * first (`SELECT FOR UPDATE`) so concurrent admins racing to approve the
 * same pair are serialised: the first commits, the second sees 0 rows and
 * returns 409.
 *
 * For each child table that has a unique constraint involving project_id,
 * we pre-delete colliding rows on the B side BEFORE re-parenting — this
 * avoids the ON CONFLICT gymnastics that would otherwise be required (the
 * satellite_alerts and notifications unique indexes are expression indexes;
 * `ON CONFLICT ON CONSTRAINT` does not compose with expression indexes).
 *
 * Body shape: `{ id: string; confirmed: 'APPROVE' }`. `confirmed` is
 * validated server-side independently of the client modal (defence in
 * depth — a malicious client could POST without the typed gate).
 *
 * Response codes:
 *   200  { ok: true, mergedInto: uuid }
 *   400  invalid body / confirmation token
 *   401  unauthenticated
 *   403  authenticated but not admin
 *   404  queue row not found
 *   409  already resolved, or one of the projects already deleted
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { setSentryUserFromSession } from '@/lib/sentry';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { id?: unknown; confirmed?: unknown };

export async function POST(request: Request) {
  const session = await auth();
  setSentryUserFromSession(session);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  }
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const queueId = typeof body.id === 'string' ? body.id : '';
  if (!UUID_RE.test(queueId)) {
    return NextResponse.json({ error: 'id must be a UUID' }, { status: 400 });
  }

  // Case-sensitive confirmation gate. The client modal enforces the same
  // string; we re-check here so the route is safe against crafted POSTs.
  if (body.confirmed !== 'APPROVE') {
    return NextResponse.json(
      { error: 'Confirmation token mismatch' },
      { status: 400 },
    );
  }

  const adminUserId = session.user.id as string | undefined;
  if (!adminUserId) {
    return NextResponse.json(
      { error: 'session missing user.id' },
      { status: 500 },
    );
  }

  type TxResult =
    | { ok: true; mergedInto: string }
    | { status: number; error: string };

  let result: TxResult;
  try {
    result = await db.transaction(async (tx) => {
      // 1. Lock the queue row. `pending` filter means already-resolved rows
      //    fall through to the 409 branch below.
      const locked = await tx.execute<{
        id: string;
        candidate_a_id: string | null;
        candidate_b_id: string | null;
        similarity: string | null;
      }>(sql`
        SELECT id, candidate_a_id, candidate_b_id, similarity
        FROM project_match_queue
        WHERE id = ${queueId} AND status = 'pending'
        FOR UPDATE
      `);
      const lockedRows = Array.isArray(locked)
        ? locked
        : (locked as unknown as { id: string; candidate_a_id: string | null; candidate_b_id: string | null; similarity: string | null }[]);
      if (lockedRows.length === 0) {
        // Could be unknown id, or non-pending status. Disambiguate with a
        // second (non-locking) lookup so the client sees 404 vs 409.
        const existing = await tx.execute<{ id: string }>(sql`
          SELECT id FROM project_match_queue WHERE id = ${queueId} LIMIT 1
        `);
        const existingRows = Array.isArray(existing)
          ? existing
          : (existing as unknown as { id: string }[]);
        if (existingRows.length === 0) {
          return { status: 404, error: 'Queue row not found' };
        }
        return { status: 409, error: 'Already resolved' };
      }

      const aId = lockedRows[0].candidate_a_id;
      const bId = lockedRows[0].candidate_b_id;
      const similarity = lockedRows[0].similarity;

      if (!aId || !bId) {
        return {
          status: 409,
          error: 'One or both candidate projects have already been deleted',
        };
      }

      // 2. Load both project rows.
      const projectRows = await tx.execute<{
        id: string;
        slug: string;
        name_canonical: string;
        name_aliases: string[] | null;
      }>(sql`
        SELECT id, slug, name_canonical, name_aliases
        FROM projects
        WHERE id IN (${aId}, ${bId})
      `);
      const projRows = Array.isArray(projectRows)
        ? projectRows
        : (projectRows as unknown as {
            id: string;
            slug: string;
            name_canonical: string;
            name_aliases: string[] | null;
          }[]);
      const a = projRows.find((p) => p.id === aId);
      const b = projRows.find((p) => p.id === bId);
      if (!a || !b) {
        return {
          status: 409,
          error: 'One or both candidate projects have already been deleted',
        };
      }

      // 3. registries — UNIQUE(registry_name, external_id).
      await tx.execute(sql`
        DELETE FROM registries
        WHERE project_id = ${bId}
          AND (registry_name, external_id) IN (
            SELECT registry_name, external_id FROM registries WHERE project_id = ${aId}
          )
      `);
      await tx.execute(sql`
        UPDATE registries SET project_id = ${aId} WHERE project_id = ${bId}
      `);

      // 4. issuances — UNIQUE(project_id, vintage_year, issuance_date, registry_name).
      await tx.execute(sql`
        DELETE FROM issuances
        WHERE project_id = ${bId}
          AND (vintage_year, issuance_date, registry_name) IN (
            SELECT vintage_year, issuance_date, registry_name
            FROM issuances WHERE project_id = ${aId}
          )
      `);
      await tx.execute(sql`
        UPDATE issuances SET project_id = ${aId} WHERE project_id = ${bId}
      `);

      // 5. satellite_alerts — expression-unique on
      //    (project_id, alert_date, ROUND(ST_Y(location),6), ROUND(ST_X(location),6)).
      await tx.execute(sql`
        DELETE FROM satellite_alerts
        WHERE project_id = ${bId}
          AND (
            alert_date,
            ROUND(ST_Y(location::geometry)::numeric, 6),
            ROUND(ST_X(location::geometry)::numeric, 6)
          ) IN (
            SELECT
              alert_date,
              ROUND(ST_Y(location::geometry)::numeric, 6),
              ROUND(ST_X(location::geometry)::numeric, 6)
            FROM satellite_alerts WHERE project_id = ${aId}
          )
      `);
      await tx.execute(sql`
        UPDATE satellite_alerts SET project_id = ${aId} WHERE project_id = ${bId}
      `);

      // 6. notifications — expression-unique on
      //    (user_id, type, project_id, (created_at AT TIME ZONE 'UTC')::date).
      await tx.execute(sql`
        DELETE FROM notifications
        WHERE project_id = ${bId}
          AND (user_id, type, ((created_at AT TIME ZONE 'UTC')::date)) IN (
            SELECT user_id, type, ((created_at AT TIME ZONE 'UTC')::date)
            FROM notifications WHERE project_id = ${aId}
          )
      `);
      await tx.execute(sql`
        UPDATE notifications SET project_id = ${aId} WHERE project_id = ${bId}
      `);

      // 7. retirements — no unique index; bare UPDATE is safe.
      await tx.execute(sql`
        UPDATE retirements SET project_id = ${aId} WHERE project_id = ${bId}
      `);

      // 8. Merge name_aliases: A.aliases ∪ B.aliases ∪ {B.slug, B.name_canonical}.
      await tx.execute(sql`
        UPDATE projects
        SET name_aliases = (
          SELECT array_agg(DISTINCT v) FROM unnest(
            COALESCE(name_aliases, '{}'::text[])
            || (SELECT COALESCE(name_aliases, '{}'::text[]) FROM projects WHERE id = ${bId})
            || (SELECT ARRAY[name_canonical, slug] FROM projects WHERE id = ${bId})
          ) v
        )
        WHERE id = ${aId}
      `);

      // 9a. `project_match_queue.candidate_{a,b}_id` FKs are RESTRICT
      //     (migration 001 defines no ON DELETE clause). Before we can delete
      //     B, any queue row still referencing B — including THIS queue row
      //     once it is marked `approved` — must have its B pointer cleared.
      //     Retargeting rows for OTHER queue entries that reference B by
      //     pointing them at A would double-book the pair with a surviving
      //     pending entry. Setting the reference to NULL is the clean
      //     surgical choice: the audit log in `admin_actions` retains the
      //     full provenance, so no audit information is lost.
      await tx.execute(sql`
        UPDATE project_match_queue
        SET candidate_a_id = NULL
        WHERE candidate_a_id = ${bId}
      `);
      await tx.execute(sql`
        UPDATE project_match_queue
        SET candidate_b_id = NULL
        WHERE candidate_b_id = ${bId}
      `);

      // 9b. Delete B. Any stragglers (satellite_alerts rows whose duplicate
      //     twin on A prevented re-parent) are handled by ON DELETE SET NULL
      //     or ON DELETE CASCADE per migration 001.
      await tx.execute(sql`DELETE FROM projects WHERE id = ${bId}`);

      // 10. Close the queue row. resolved_by is TEXT (migration 001) — write
      //     the admin's UUID as a plain string.
      await tx.execute(sql`
        UPDATE project_match_queue
        SET status = 'approved',
            resolved_by = ${adminUserId},
            resolved_at = NOW()
        WHERE id = ${queueId}
      `);

      // 11. Audit log.
      const payload = JSON.stringify({
        merged_b_id: bId,
        merged_b_name: b.name_canonical,
        merged_b_slug: b.slug,
        into_a_id: aId,
        into_a_name: a.name_canonical,
        similarity,
      });
      await tx.execute(sql`
        INSERT INTO admin_actions (actor_id, action, entity_type, entity_id, payload)
        VALUES (
          ${adminUserId},
          'approve-merge',
          'project_match_queue',
          ${queueId},
          ${payload}::jsonb
        )
      `);

      return { ok: true as const, mergedInto: aId };
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin/match-queue/approve] transaction failed', err);
    return NextResponse.json(
      { error: `Merge failed: ${msg}` },
      { status: 500 },
    );
  }

  if ('ok' in result) {
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: result.error }, { status: result.status });
}
