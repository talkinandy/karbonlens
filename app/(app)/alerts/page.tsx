/**
 * /alerts — personal notifications inbox. T16 replaces the T03 mock with
 * a Drizzle-backed RSC. Reads the session via `auth()` (middleware already
 * enforces redirect-to-signin; the extra guard here keeps the types honest
 * and lets the file be refactored independently).
 *
 * Filters (URL search params):
 *   - `?type=reversal,regulatory` — multi-value, comma-separated.
 *   - `?read=unread`              — toggle unread-only.
 *   - `?project=<slug>`           — deep-link; resolved to project.id.
 *   - `?before=<uuid>`            — cursor-based pagination.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import {
  getInboxNotifications,
  getUnreadCount,
  resolveProjectSlug,
  type NotificationRow as NotificationRowDto,
} from '@/lib/queries/notifications';
import { AlertsInbox } from './AlertsInbox';

// T26 — page-level metadata. `robots: { index: false }` because this page is
// per-user; search indexing would be misleading (all users see a 302 to sign-in
// without a session cookie).
export const metadata: Metadata = {
  title: 'Alerts inbox',
  description: 'Your personalised deforestation-alert digest.',
  robots: { index: false },
  openGraph: {
    url: '/alerts',
    title: 'Alerts inbox · KarbonLens',
    description: 'Your personalised deforestation-alert digest.',
  },
};

const PAGE_SIZE = 50;

const KNOWN_TYPES = new Set([
  'reversal',
  'price',
  'regulatory',
  'news',
  'retirement',
  'issuance',
]);

type SearchParams = Record<string, string | string[] | undefined>;

export default async function AlertsPage(props: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/?signin=1');
  }

  const sp = await props.searchParams;

  const typeParam = firstString(sp.type);
  const types = typeParam
    ? typeParam
        .split(',')
        .map((s) => s.trim())
        .filter((s) => KNOWN_TYPES.has(s))
    : [];

  const readParam = firstString(sp.read);
  const read: 'all' | 'unread' = readParam === 'unread' ? 'unread' : 'all';

  const projectSlug = firstString(sp.project) ?? null;
  const projectFilter = projectSlug
    ? await resolveProjectSlug(projectSlug)
    : null;

  const before = firstString(sp.before);

  // If the slug didn't resolve, render the empty state instead of
  // running an unfiltered query.
  const rows: NotificationRowDto[] =
    projectSlug && !projectFilter
      ? []
      : await getInboxNotifications(session.user.id, {
          limit: PAGE_SIZE,
          before,
          types: types.length > 0 ? types : undefined,
          read,
          projectId: projectFilter?.id,
        });

  const unreadCount = await getUnreadCount(session.user.id);

  const nextCursor =
    rows.length === PAGE_SIZE ? rows[rows.length - 1]?.id ?? null : null;

  return (
    <AlertsInbox
      rows={rows}
      unreadCount={unreadCount}
      activeTypes={types}
      activeRead={read}
      activeProject={
        projectFilter
          ? { slug: projectSlug!, name: projectFilter.name }
          : projectSlug && !projectFilter
            ? { slug: projectSlug, name: projectSlug }
            : null
      }
      nextCursor={nextCursor}
      currentCursor={before ?? null}
    />
  );
}

function firstString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
