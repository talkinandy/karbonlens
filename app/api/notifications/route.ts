/**
 * GET /api/notifications — T16 notifications feed.
 *
 * Auth: required. Returns 401 JSON (not 307) when the session is absent.
 *
 * Query params:
 *   - `countOnly=true` -> skip the latest array, return only { unread_count }.
 *     Used by <NotificationBell /> to refresh the badge on route change.
 *   - `limit` (default 10, max 50) -> used when `countOnly` is absent.
 *   - `before` (UUID cursor) -> fetch rows strictly older than the given id.
 *
 * Response: discriminated union `NotificationsResponse`
 *   = CountOnlyResponse | FullResponse
 * See `docs/stories/T16-notifications-bell-inbox.md` §3 item 2.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getLatestNotifications,
  getUnreadCount,
  type NotificationDto,
} from '@/lib/queries/notifications';

export type CountOnlyResponse = { unread_count: number };
export type FullResponse = {
  unread_count: number;
  latest: NotificationDto[];
};
export type NotificationsResponse = CountOnlyResponse | FullResponse;

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthenticated' },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const countOnly = url.searchParams.get('countOnly') === 'true';
  const unread_count = await getUnreadCount(session.user.id);

  if (countOnly) {
    const body: CountOnlyResponse = { unread_count };
    return NextResponse.json(body);
  }

  const limitRaw = url.searchParams.get('limit');
  const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : 10;
  const limit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 1), 50)
    : 10;
  const before = url.searchParams.get('before') ?? undefined;

  const latest = await getLatestNotifications(session.user.id, {
    limit,
    before,
  });

  const body: FullResponse = { unread_count, latest };
  return NextResponse.json(body);
}
