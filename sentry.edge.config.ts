/**
 * Sentry edge-runtime configuration — KarbonLens v0.1 (T22).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === 'edge'`. The edge
 * runtime is used by `proxy.ts` (Next.js middleware). Same no-op guard
 * pattern as `sentry.server.config.ts`; identical `beforeSend` scrubber
 * so edge-captured errors are filtered and scrubbed consistently.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  console.log('[sentry] SENTRY_DSN not set — Sentry disabled');
} else {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    beforeSend(event, hint) {
      const err = hint?.originalException;
      if (err && typeof err === 'object') {
        const name = (err as Error).name ?? '';
        const msg = (err as Error).message ?? '';

        if (name === 'NotFoundError' || msg.includes('NEXT_NOT_FOUND')) {
          return null;
        }
        if (name === 'UnauthorizedError' || msg.includes('NEXT_REDIRECT')) {
          return null;
        }

        const lower = msg.toLowerCase();
        if (lower.includes('drizzle') || lower.includes('postgres')) {
          if (Math.random() > 0.1) return null;
        }
      }

      const emailRe = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
      if (event.message) {
        event.message = event.message.replace(emailRe, '[email]');
      }
      if (event.exception?.values) {
        for (const ex of event.exception.values) {
          if (ex.value) ex.value = ex.value.replace(emailRe, '[email]');
        }
      }
      if (event.extra) {
        for (const key of Object.keys(event.extra)) {
          const v = event.extra[key];
          if (typeof v === 'string') {
            event.extra[key] = v.replace(emailRe, '[email]');
          }
        }
      }

      return event;
    },
  });
}
