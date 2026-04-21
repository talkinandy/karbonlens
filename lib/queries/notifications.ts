/**
 * lib/queries/notifications.ts — T16 notifications inbox queries.
 *
 * Helpers shared between the API routes (`app/api/notifications/*`) and
 * the server-component inbox page (`app/(app)/alerts/page.tsx`). Each
 * helper takes the authenticated `userId` as the first argument — the
 * caller is responsible for resolving the session; these helpers do not
 * call `auth()` themselves.
 *
 * Deduplication is enforced by the partial-unique index
 * `uq_notifications_dedupe` in `scrapers/migrations/002_add_geostore.sql`
 * — T16 does not re-implement that logic in application code.
 */

import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications, projects } from '@/lib/schema';

export type NotificationDto = {
  id: string;
  type: string;
  title: string;
  description: string;
  project_id: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

export type NotificationRow = NotificationDto & {
  project_slug: string | null;
  project_name: string | null;
};

/** Count unread notifications for a user. Cheap index scan on
 * `idx_notifications_user_read`. */
export async function getUnreadCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    );
  return row?.count ?? 0;
}

/** Fetch the latest notifications for the bell dropdown (no joins). */
export async function getLatestNotifications(
  userId: string,
  opts: { limit?: number; before?: string } = {},
): Promise<NotificationDto[]> {
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 50);
  const whereClauses = [eq(notifications.userId, userId)];
  if (opts.before) {
    // Cursor: fetch rows strictly older than the given id's created_at.
    // We resolve the cursor id's timestamp inline via a subquery so we
    // don't require a separate round-trip from the caller.
    const cursorTs = db
      .select({ createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.id, opts.before));
    whereClauses.push(lt(notifications.createdAt, sql`(${cursorTs})`));
  }
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      description: notifications.description,
      projectId: notifications.projectId,
      url: notifications.url,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(and(...whereClauses))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map(toDto);
}

/** Inbox query with filters + project join for the /alerts RSC. */
export async function getInboxNotifications(
  userId: string,
  opts: {
    limit?: number;
    before?: string;
    types?: string[];
    read?: 'all' | 'unread';
    projectId?: string;
  } = {},
): Promise<NotificationRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const whereClauses = [eq(notifications.userId, userId)];
  if (opts.types && opts.types.length > 0) {
    whereClauses.push(inArray(notifications.type, opts.types));
  }
  if (opts.read === 'unread') {
    whereClauses.push(isNull(notifications.readAt));
  }
  if (opts.projectId) {
    whereClauses.push(eq(notifications.projectId, opts.projectId));
  }
  if (opts.before) {
    const cursorTs = db
      .select({ createdAt: notifications.createdAt })
      .from(notifications)
      .where(eq(notifications.id, opts.before));
    whereClauses.push(lt(notifications.createdAt, sql`(${cursorTs})`));
  }

  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      description: notifications.description,
      projectId: notifications.projectId,
      url: notifications.url,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      projectSlug: projects.slug,
      projectName: projects.nameCanonical,
    })
    .from(notifications)
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(and(...whereClauses))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...toDto({
      id: r.id,
      type: r.type,
      title: r.title,
      description: r.description,
      projectId: r.projectId,
      url: r.url,
      readAt: r.readAt,
      createdAt: r.createdAt,
    }),
    project_slug: r.projectSlug ?? null,
    project_name: r.projectName ?? null,
  }));
}

/** Resolve a project slug to an id (+ name) or null. Used by the
 * `?project=<slug>` deep-link on `/alerts`. */
export async function resolveProjectSlug(
  slug: string,
): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: projects.id, name: projects.nameCanonical })
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return row ?? null;
}

/** Mark individual notifications as read. Scoped to `userId` so a user
 * cannot mark another user's rows. Returns the number of rows updated. */
export async function markNotificationsRead(
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return result.length;
}

/** Mark every unread notification as read for the given user. */
export async function markAllNotificationsRead(
  userId: string,
): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(notifications.userId, userId), isNull(notifications.readAt)),
    )
    .returning({ id: notifications.id });
  return result.length;
}

function toDto(row: {
  id: string;
  type: string;
  title: string;
  description: string | null;
  projectId: string | null;
  url: string | null;
  readAt: Date | null;
  createdAt: Date | null;
}): NotificationDto {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description ?? '',
    project_id: row.projectId,
    url: row.url,
    read_at: row.readAt ? row.readAt.toISOString() : null,
    created_at: row.createdAt ? row.createdAt.toISOString() : '',
  };
}
