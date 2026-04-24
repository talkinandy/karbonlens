/**
 * lib/sentry.ts — Sentry user-scope helper (T22.1).
 *
 * Attaches the authenticated user's UUID (from NextAuth `session.user.id`)
 * to the current Sentry request scope so errors captured during that
 * request get a searchable "User" block in the Sentry UI. We deliberately
 * pass only the `id` — email is PII and the `beforeSend` scrubber in
 * `sentry.server.config.ts` is already stripping emails from free-form
 * message strings; passing it here would be an end-run around that.
 *
 * Call this right after `auth()` at the top of any request handler where
 * attributing errors to a specific user matters (admin routes, session-
 * mutating endpoints, etc.). Safe to call when Sentry is disabled
 * (`SENTRY_DSN` unset) or when the session is null — both are no-ops.
 */

import * as Sentry from '@sentry/nextjs';
import type { Session } from 'next-auth';

export function setSentryUserFromSession(
  session: Session | null | undefined,
): void {
  if (!process.env.SENTRY_DSN) return;
  if (session?.user?.id) {
    Sentry.setUser({ id: session.user.id });
  } else {
    Sentry.setUser(null);
  }
}
