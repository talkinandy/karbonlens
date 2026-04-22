/**
 * lib/queries/digest.ts — T17 weekly-digest aggregation.
 *
 * Helpers shared between the digest cron endpoint (`app/api/digest/route.ts`)
 * and the preview script (`scripts/digest-preview.ts`).
 *
 * Contract — each helper takes `userId` and operates over the 7-day window
 * `created_at >= NOW() - INTERVAL '7 days'`. Notifications already included
 * in an earlier digest (`digested_at IS NOT NULL`) are excluded, which makes
 * the endpoint idempotent: re-running in the same week sends 0 emails.
 *
 * The aggregation groups notifications by project (null project -> "Other")
 * and returns both a flat `items` list and a `groups` list so the template
 * can render either view. `totalCount` preserves the pre-truncation count
 * so the template can render "+N more" when items are capped.
 *
 * See `docs/stories/T17-weekly-digest-email.md` §3 items 1-3 for the
 * authoritative contract. Idempotence is enforced by the `digested_at`
 * write-back: after a successful sendEmail the route calls
 * `markNotificationsDigested`, which sets `digested_at = NOW()` on the
 * included rows. Subsequent runs filter `digested_at IS NULL` so the same
 * notification never appears in two consecutive digests (audit F2 fix).
 */

import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { notifications, projects, users } from '@/lib/schema';

export type DigestNotificationItem = {
  id: string;
  type: string;
  title: string;
  description: string;
  project_id: string | null;
  project_slug: string | null;
  project_name: string | null;
  url: string | null;
  created_at: string; // ISO
};

export type DigestProjectGroup = {
  project_id: string | null;
  project_slug: string | null;
  project_name: string; // "Other" when project_id is null
  count: number;
  items: DigestNotificationItem[];
};

export type DigestUser = {
  id: string;
  email: string;
  name: string | null;
};

export type DigestBundle = {
  user: DigestUser;
  /** Total notifications in the 7-day window (all types, all projects). */
  totalCount: number;
  /** Distinct projects impacted (excludes the null/"Other" bucket). */
  projectCount: number;
  /** Count by notification type (reversal/regulatory/price/...). */
  byType: Record<string, number>;
  /** Up to 10 most-recent items, flattened. */
  items: DigestNotificationItem[];
  /** All notification IDs in the window (used by markNotificationsDigested). */
  allIds: string[];
  /** Groups by project (project_id null → name="Other"), ordered by count desc. */
  groups: DigestProjectGroup[];
  /** The [weekStart, weekEnd] window, YYYY-MM-DD, UTC. */
  windowStart: string;
  windowEnd: string;
};

/** v0.1 cap — the template renders "+N more" above this. */
export const DIGEST_ITEM_CAP = 10;

/** Fetch all users eligible for a digest (email_digest_opt_in=TRUE). */
export async function listOptedInUsers(): Promise<DigestUser[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.emailDigestOptIn, true));
  return rows;
}

/** Fetch one user row (for the preview script / targeted runs). */
export async function getUserById(
  userId: string,
): Promise<DigestUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Build the digest bundle for a single user.
 *
 * Returns `null` if the user has zero qualifying notifications in the
 * 7-day window — the caller should skip sending an email in that case.
 */
export async function buildDigestForUser(
  user: DigestUser,
  opts: { now?: Date } = {},
): Promise<DigestBundle | null> {
  const now = opts.now ?? new Date();
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const windowStartDate = new Date(now.getTime() - windowMs);

  const whereClauses = and(
    eq(notifications.userId, user.id),
    gte(notifications.createdAt, windowStartDate),
    isNull(notifications.digestedAt),
  );

  // Pull the full set so we can accurately compute totalCount + groups.
  // 7 days × typical volume is tiny; no pagination required.
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      description: notifications.description,
      projectId: notifications.projectId,
      url: notifications.url,
      createdAt: notifications.createdAt,
      projectSlug: projects.slug,
      projectName: projects.nameCanonical,
    })
    .from(notifications)
    .leftJoin(projects, eq(projects.id, notifications.projectId))
    .where(whereClauses)
    .orderBy(desc(notifications.createdAt));

  if (rows.length === 0) return null;

  const items: DigestNotificationItem[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    title: r.title,
    description: r.description ?? '',
    project_id: r.projectId,
    project_slug: r.projectSlug ?? null,
    project_name: r.projectName ?? null,
    url: r.url,
    created_at: r.createdAt ? r.createdAt.toISOString() : '',
  }));

  // byType roll-up.
  const byType: Record<string, number> = {};
  for (const it of items) {
    byType[it.type] = (byType[it.type] ?? 0) + 1;
  }

  // Group by project. Null project_id → "Other" bucket.
  const groupMap = new Map<string, DigestProjectGroup>();
  for (const it of items) {
    const key = it.project_id ?? '__null__';
    let g = groupMap.get(key);
    if (!g) {
      g = {
        project_id: it.project_id,
        project_slug: it.project_slug,
        project_name: it.project_name ?? 'Other',
        count: 0,
        items: [],
      };
      groupMap.set(key, g);
    }
    g.count += 1;
    g.items.push(it);
  }
  const groups = Array.from(groupMap.values()).sort((a, b) => b.count - a.count);
  const projectCount = groups.filter((g) => g.project_id !== null).length;

  const windowStart = windowStartDate.toISOString().slice(0, 10);
  const windowEnd = now.toISOString().slice(0, 10);

  return {
    user,
    totalCount: items.length,
    projectCount,
    byType,
    items: items.slice(0, DIGEST_ITEM_CAP),
    allIds: items.map((it) => it.id),
    groups,
    windowStart,
    windowEnd,
  };
}

/**
 * Mark the notifications included in a successful send as digested. Safe no-op
 * when `ids` is empty. Scoped to `userId` so a bug in the caller cannot flip
 * another user's rows.
 *
 * Called by POST /api/digest after a successful sendEmail (skipped in dry-run
 * so re-runs remain read-only). Implements idempotence: once marked, these
 * rows are excluded from the `digested_at IS NULL` filter on the next run.
 */
export async function markNotificationsDigested(
  userId: string,
  ids: string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .update(notifications)
    .set({ digestedAt: new Date() })
    .where(
      and(
        eq(notifications.userId, userId),
        sql`${notifications.id} = ANY(${ids})`,
        isNull(notifications.digestedAt),
      ),
    )
    .returning({ id: notifications.id });
  return result.length;
}
