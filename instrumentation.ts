/**
 * Next.js 16 instrumentation hook — T22 Sentry wire-up.
 *
 * `register()` runs once per runtime on boot. We branch on
 * `process.env.NEXT_RUNTIME` so the Node.js-only APIs inside
 * `sentry.server.config.ts` never load in the edge runtime (and vice
 * versa). Without the branch, both config modules are imported in both
 * runtimes, and the edge bundle fails at build time.
 *
 * Sentry SDK `captureRequestError` is re-exported so Next.js can forward
 * server/edge request-time errors into Sentry automatically (see
 * `https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/`).
 */

import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
