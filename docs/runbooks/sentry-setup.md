# Sentry setup — KarbonLens v0.1 (T22)

This runbook is **Phase B** for T22: the live-DSN smoke test that
requires Andy's interaction with the Sentry dashboard. Phase A (package
install, config files, runtime no-op when DSN absent) is already done
and verified in CI.

Estimated time: **10 minutes**.

---

## 1. Create the Sentry project

1. Sign up at [sentry.io](https://sentry.io) — free plan, no credit card
   required. Free tier: 5,000 errors/month, 1 project, 1 org, unlimited
   team. v0.1 expected load is < 100 events/month, so no upgrade needed.
2. Create a new project:
   - Platform: **Next.js**
   - Project name: **karbonlens**
   - Team: default

## 2. Collect the DSN and auth token

1. **DSN.** Copy from **Settings -> Projects -> karbonlens -> Client
   Keys (DSN)**. Shape:
   `https://<key>@<id>.ingest.sentry.io/<project>`.
2. **Auth token.** Create at **Settings -> Account -> API -> Auth
   Tokens**. Required scope: `project:releases`. Copy the token
   immediately — it is shown only once.
3. **Org + project slugs.** Read them from your Sentry URL:
   `sentry.io/<org-slug>/<project-slug>`. The project slug should be
   `karbonlens` if you named it per step 1.

## 3. Local dev — populate `.env.local`

Add the following five lines to `.env.local` (create the file if it
does not yet exist; it is gitignored):

```
SENTRY_DSN=https://<key>@<id>.ingest.sentry.io/<project>
NEXT_PUBLIC_SENTRY_DSN=https://<key>@<id>.ingest.sentry.io/<project>
SENTRY_AUTH_TOKEN=<token>
SENTRY_ORG=<your-org-slug>
SENTRY_PROJECT=karbonlens
```

**Why two DSN vars?** The browser bundle can only read env vars prefixed
`NEXT_PUBLIC_`. Same value, two keys.

## 4. Netlify — populate production env vars

Go to **Site settings -> Environment variables** and add the same five
vars. Netlify automatically exposes `NEXT_PUBLIC_*` vars at build time
for Next.js.

## 5. Deploy and trigger the debug endpoint

1. Redeploy from Netlify (or push a commit to trigger a build).
2. Sign in to the production site as admin (`andy@fmg.co.id`).
3. Hit the debug endpoint:
   ```bash
   curl -v https://karbonlens.netlify.app/api/admin/debug-sentry \
        -H "Cookie: <your session cookie>"
   ```
   Expected response: **500 Internal Server Error**. This is deliberate
   — the route exists solely to throw a test error into Sentry.

## 6. Verify the event arrived

1. Open the Sentry dashboard -> **Issues**.
2. Within 30 seconds, a new issue titled **"Sentry test — safe to
   trigger"** should appear.
3. Click into the issue and confirm:
   - The stack trace is **source-mapped** back to
     `app/api/admin/debug-sentry/route.ts` (not minified). If the stack
     trace is minified, `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` /
     `SENTRY_PROJECT` were not set at build time — re-check step 4 and
     trigger a redeploy.
   - **User context is unset in v0.1** — a follow-up story (T22.1) will
     attach `user.id` to the Sentry scope via the session callback in
     `lib/auth.ts`. For Phase B verification, the issue sidebar will show
     "no user" — this is expected. Verify instead: (a) the event reached
     Sentry; (b) the stack trace has source-mapped filenames; (c) the
     error message matches the thrown Error.

## 7. Optional — configure alerting

In **Alerts -> Create Alert**, set up an email notification when any new
issue is assigned to you. v0.1 traffic is low enough that "notify on
every new issue" is reasonable. Revisit the threshold in v0.2.

---

## Troubleshooting

- **"Sentry disabled (no DSN)" in Netlify build logs** — `SENTRY_DSN`
  is missing from Netlify env vars. Add it under Site settings ->
  Environment variables.
- **"Source map upload skipped — SENTRY_AUTH_TOKEN not set"** — expected
  when `SENTRY_AUTH_TOKEN` is absent. Stack traces will be minified in
  the dashboard. Add the auth token and redeploy.
- **Debug endpoint returns 403 instead of 500** — your account email is
  not in the allowlist at `lib/admin.ts`. Add it (requires code change
  + PR) or sign in with an allowed account.
- **Debug endpoint redirects to `/?signin=1`** — your browser session
  expired. Sign in at the landing page and retry.

## Deferred to v0.2

- **Python scraper instrumentation.** Scrapers currently emit structured
  logs via `structlog`. v0.2 will add `sentry-sdk` via pip with either
  the same DSN (distinguished by an `environment: scraper` tag) or a
  separate Sentry project. v0.1 relies on manual log inspection
  (`sudo journalctl -u karbonlens-scraper`).
- **Session replay.** Free tier includes 500 replays/month; nice-to-have
  but deferred to keep T22 scope tight.
- **Release health tracking.** Requires a Netlify deploy hook; deferred
  until the deploy pipeline is more mature.
- **Performance tracing.** Paid feature. `tracesSampleRate: 0` in all
  three `sentry.*.config.ts` files explicitly disables it.
