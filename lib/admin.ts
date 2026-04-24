/**
 * lib/admin.ts — shared admin allowlist + `isAdmin(session)` helper.
 *
 * The allowlist is read once from the `ADMIN_EMAILS` env var (comma-
 * separated). Missing or empty → no admins, which fails closed.
 *
 * Moved to env (from the original in-source array) before open-sourcing
 * the repo: the emails themselves are not credentials, but they are
 * personal contact info and should not live in public source.
 * Auditability is preserved through the deploy pipeline / secret manager
 * rather than git blame.
 */

import type { Session } from 'next-auth';

function parseAdminEmails(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

const ADMIN_EMAILS: readonly string[] = parseAdminEmails(
  process.env.ADMIN_EMAILS,
);

/**
 * True iff `session?.user?.email` is in the admin allowlist.
 *
 * Accepts `Session | null` (what `await auth()` returns) so callers can
 * `if (!isAdmin(session)) return notFound()` without an extra null-check.
 */
export function isAdmin(session: Session | null | undefined): boolean {
  const email = session?.user?.email;
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
