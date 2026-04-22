/**
 * Sentry browser configuration — KarbonLens v0.1 (T22).
 *
 * Re-exported by `instrumentation-client.ts`, which Next.js 16 runs on the
 * browser bundle automatically. Reads `NEXT_PUBLIC_SENTRY_DSN` — browser
 * env vars must be prefixed `NEXT_PUBLIC_`. The runbook (`docs/runbooks/
 * sentry-setup.md`) tells Andy to set both `SENTRY_DSN` and
 * `NEXT_PUBLIC_SENTRY_DSN` to the same value.
 *
 * Client-side `beforeSend` drops the two framework signals Next.js throws
 * during normal navigation (`NEXT_NOT_FOUND`, `NEXT_REDIRECT`) — neither
 * is a bug. No email scrubbing here: the browser rarely surfaces user
 * email addresses in thrown Error messages (and if it did, the event
 * still passes through the server-side scrubber on Sentry's relay).
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (!dsn) {
  console.log('[sentry] NEXT_PUBLIC_SENTRY_DSN not set — Sentry disabled');
} else {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      const err = hint?.originalException;
      if (err && typeof err === 'object') {
        const msg = (err as Error).message ?? '';
        if (msg.includes('NEXT_NOT_FOUND') || msg.includes('NEXT_REDIRECT')) {
          return null;
        }
      }
      return event;
    },
  });
}
