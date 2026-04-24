/**
 * lib/admin.ts — shared admin allowlist + `isAdmin(session)` helper.
 *
 * Shared between T21 (match-queue admin page) and T22 (Sentry debug
 * endpoint). Authored under T22 per the revised Phase-4 audit decision
 * (switching from a `NEXT_PUBLIC_ADMIN_EMAIL` env-var single-admin gate
 * to an in-code allowlist). If T22 merges first, T21 imports from here.
 * If T21 lands first and creates this file independently, T22 reads the
 * existing definition.
 *
 * Deliberately in-code rather than env-var because (a) the allowlist is
 * non-secret (admin emails are not credentials — they just keep UX from
 * exposing admin affordances to regular users), (b) keeping it in source
 * control gives us auditability (every allowlist change shows up in git
 * blame / PR review), and (c) it avoids a deploy-time footgun where a
 * missing env var silently unlocks no one.
 */

import type { Session } from 'next-auth';

export const ADMIN_EMAILS: readonly string[] = [
  'andy@fmg.co.id',
  'icdragoneyes@gmail.com',
];

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
