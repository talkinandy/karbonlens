/**
 * POST /api/admin/match-queue/reject — T21 reject handler.
 *
 * Marks the queue row as `rejected` and writes an `admin_actions` audit row.
 * No project data is modified — both candidates remain as distinct rows.
 *
 * Body: `{ id: string }`.
 */

import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { isAdmin } from '@/lib/admin';
import { db } from '@/lib/db';
import { setSentryUserFromSession } from '@/lib/sentry';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = { id?: unknown };

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

  const adminUserId = session.user.id as string | undefined;
  if (!adminUserId) {
    return NextResponse.json(
      { error: 'session missing user.id' },
      { status: 500 },
    );
  }

  type Row = {
    id: string;
    status: string;
    candidate_a_id: string | null;
    candidate_b_id: string | null;
    a_name: string | null;
    b_name: string | null;
  };

  const loaded = await db.execute<Row>(sql`
    SELECT pmq.id, pmq.status,
           pmq.candidate_a_id, pmq.candidate_b_id,
           pa.name_canonical AS a_name,
           pb.name_canonical AS b_name
    FROM project_match_queue pmq
    LEFT JOIN projects pa ON pa.id = pmq.candidate_a_id
    LEFT JOIN projects pb ON pb.id = pmq.candidate_b_id
    WHERE pmq.id = ${queueId}
    LIMIT 1
  `);
  const rows = Array.isArray(loaded) ? loaded : (loaded as unknown as Row[]);
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Queue row not found' }, { status: 404 });
  }
  if (rows[0].status !== 'pending') {
    return NextResponse.json(
      { error: `Cannot reject — row is already ${rows[0].status}` },
      { status: 409 },
    );
  }

  const row = rows[0];

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        UPDATE project_match_queue
        SET status = 'rejected',
            resolved_by = ${adminUserId},
            resolved_at = NOW()
        WHERE id = ${queueId} AND status = 'pending'
      `);
      const payload = JSON.stringify({
        a_id: row.candidate_a_id,
        b_id: row.candidate_b_id,
        a_name: row.a_name,
        b_name: row.b_name,
      });
      await tx.execute(sql`
        INSERT INTO admin_actions (actor_id, action, entity_type, entity_id, payload)
        VALUES (
          ${adminUserId},
          'reject-match',
          'project_match_queue',
          ${queueId},
          ${payload}::jsonb
        )
      `);
    });
  } catch (err) {
    console.error('[admin/match-queue/reject] failed', err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Reject failed: ${msg}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
