/**
 * POST /api/notifications/mark-read — T16 mark-read mutation.
 *
 * Auth: required. Returns 401 JSON (not 307) when the session is absent.
 *
 * Body: { ids: string[] } OR { all: true }. At least one of the two must
 * be present, otherwise 400.
 *
 * Scope is always `user_id = session.user.id` — a user cannot mark
 * another user's notifications. The UPDATE filters on `read_at IS NULL`
 * so the call is idempotent (re-running marks 0 rows).
 *
 * Response: { updated: number, unread_count: number }.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getUnreadCount,
  markAllNotificationsRead,
  markNotificationsRead,
} from '@/lib/queries/notifications';

type Body = {
  ids?: unknown;
  all?: unknown;
};

// Loose UUID check — Postgres rejects malformed UUIDs anyway, but this
// short-circuits obvious bad input with a 400 instead of a 500.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: 'invalid JSON body' },
      { status: 400 },
    );
  }

  const wantsAll = body.all === true;
  const idsRaw = body.ids;
  let ids: string[] | null = null;

  if (Array.isArray(idsRaw)) {
    if (idsRaw.length === 0) {
      if (!wantsAll) {
        return NextResponse.json(
          { error: 'ids array must be non-empty (or set all: true)' },
          { status: 400 },
        );
      }
    } else {
      if (!idsRaw.every((v) => typeof v === 'string' && UUID_RE.test(v))) {
        return NextResponse.json(
          { error: 'ids must be an array of UUID strings' },
          { status: 400 },
        );
      }
      ids = idsRaw as string[];
    }
  }

  if (!wantsAll && !ids) {
    return NextResponse.json(
      { error: 'body must include either ids: string[] or all: true' },
      { status: 400 },
    );
  }

  let updated: number;
  if (wantsAll) {
    updated = await markAllNotificationsRead(session.user.id);
  } else if (ids) {
    updated = await markNotificationsRead(session.user.id, ids);
  } else {
    updated = 0;
  }

  const unread_count = await getUnreadCount(session.user.id);
  return NextResponse.json({ updated, unread_count });
}
