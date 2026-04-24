import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry webpack plugin options. `authToken` gates source-map upload: if
// absent, the plugin silently skips upload (so local dev and builds
// without a Sentry account still succeed cleanly). We emit one explicit
// log line before wrapping so the skip is visible in CI logs.
const sentryWebpackPluginOptions = {
  authToken: process.env.SENTRY_AUTH_TOKEN || undefined,
  org: process.env.SENTRY_ORG || undefined,
  project: process.env.SENTRY_PROJECT || undefined,
  silent: true,
  hideSourceMaps: true,
};

// Build-time visibility for CI: echo the runtime-no-op state from
// `next.config.ts` so the log is present in the build output (the
// runtime `Sentry.init` guard inside `sentry.server.config.ts` only
// fires when the server boots, which does not happen during `next
// build`). Matches T22 AC-3.
//
// Next.js Turbopack evaluates `next.config.ts` in a main process and a
// separate worker process. A module-level flag won't dedupe across
// processes; we use a single env-var sentinel (set in the first process
// and inherited by children) to keep the log line exactly once per
// `npm run build` invocation.
if (!process.env.__KARBONLENS_SENTRY_BUILD_LOGGED) {
  if (!process.env.SENTRY_DSN) {
    console.log('[sentry] SENTRY_DSN not set — Sentry disabled');
  }
  if (!process.env.SENTRY_AUTH_TOKEN) {
    console.log('[sentry] Source map upload skipped — SENTRY_AUTH_TOKEN not set');
  }
  process.env.__KARBONLENS_SENTRY_BUILD_LOGGED = '1';
}

// Unconditional wrap per T22 §3 (audit decision): gating the wrap on
// `SENTRY_DSN` at build time produces a permanently-uninstrumented
// deployment if the env var is missing during CI build. Runtime no-op
// is handled inside each `sentry.*.config.ts` via the DSN guard.
export default withSentryConfig(nextConfig, sentryWebpackPluginOptions);
