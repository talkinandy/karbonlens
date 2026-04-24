/**
 * Next.js 16 client-side instrumentation hook — T22 Sentry wire-up.
 *
 * Next.js automatically imports this file on the browser bundle entry.
 * All we do is re-export the Sentry client configuration (which calls
 * `Sentry.init` with `NEXT_PUBLIC_SENTRY_DSN` when the DSN is present,
 * or no-ops with a single console log otherwise). Sentry's router
 * transition hook is re-exported so client navigation timing is captured
 * correctly once tracing is enabled (in v0.1 `tracesSampleRate: 0`
 * disables it — the export is still required by the SDK contract).
 */

import * as Sentry from '@sentry/nextjs';
import './sentry.client.config';

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
