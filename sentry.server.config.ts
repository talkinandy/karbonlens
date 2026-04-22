/**
 * Sentry server-runtime configuration — KarbonLens v0.1 (T22).
 *
 * Loaded by `instrumentation.ts` when `NEXT_RUNTIME === 'nodejs'`. This
 * file is always evaluated (we wrap `next.config.ts` with
 * `withSentryConfig` unconditionally — see the T22 spec §3 item 2 and the
 * retro rationale: conditional build-time wrapping is the
 * "deployed-without-DSN-is-permanently-uninstrumented" trap). Runtime
 * no-op is implemented here instead.
 *
 * Behaviour:
 *   - No `SENTRY_DSN`  -> skip `Sentry.init`, log once on boot.
 *   - `SENTRY_DSN` set -> initialise with `tracesSampleRate: 0`
 *     (performance tracing is a paid feature; explicitly disabled) and
 *     the `beforeSend` scrubber that regex-strips email addresses from
 *     free-form error message strings and drops expected NEXT_NOT_FOUND /
 *     NEXT_REDIRECT framework signals.
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

if (!dsn) {
  // Exactly one stdout line on boot (Next.js evaluates the module once
  // per runtime). Do NOT log per-request.
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

        // Framework signals, not bugs.
        if (name === 'NotFoundError' || msg.includes('NEXT_NOT_FOUND')) {
          return null;
        }
        if (name === 'UnauthorizedError' || msg.includes('NEXT_REDIRECT')) {
          return null;
        }

        // Sample noisy DB errors at 1-in-10 so a flood does not exhaust
        // the 5k/month free-tier quota.
        const lower = msg.toLowerCase();
        if (lower.includes('drizzle') || lower.includes('postgres')) {
          if (Math.random() > 0.1) return null;
        }
      }

      // Regex-scrub email addresses from free-form string fields. Sentry's
      // built-in scrubber only targets structured field names (password,
      // token, api_key) — it does not scan message text.
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
