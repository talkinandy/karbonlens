---
id: T26-spec-audit
story: T26
title: "Spec audit — Social preview (OG + Twitter cards)"
auditor: Claude Sonnet 4.6 (adversarial)
date: 2026-04-22
verdict: PASS-WITH-FIXES
blocking: 1
non_blocking: 7
---

## Verdict

**PASS-WITH-FIXES** — 1 blocking issue, 7 non-blocking. The spec is thorough and the
implementation guidance is well-grounded in Next.js 16 idioms. The single blocking issue is
critical: `opengraph-image.tsx` exports `runtime = 'edge'` and imports `getProjectDetail`,
which internally calls `lib/db.ts` — a `postgres-js` Drizzle client. `postgres-js` uses Node.js
`net.Socket` and is **incompatible with Vercel/Netlify Edge runtime**. This will produce a
build error or a silent runtime crash on any edge-deployed platform. On the current Hetzner
VPS (self-hosted Next.js), there is no Edge runtime; the route runs in the Node process and
works. If the deployment target ever moves to Netlify Edge Functions or Vercel Edge, the spec
as written will break. The spec must document this constraint explicitly and either (a) drop
`runtime = 'edge'` in favour of `runtime = 'nodejs'`, or (b) provide an HTTP-fetch fallback
pattern for edge-compat DB access. All other findings are non-blocking.

---

## Blocking issues

### B-1 — Edge runtime + `postgres-js` Drizzle client: incompatible

**Spec §3.5:** `export const runtime = 'edge'` in `opengraph-image.tsx`. The file imports
`getProjectDetail` from `@/lib/queries/project-detail`, which imports `db` from `@/lib/db`.

**Reality:** `lib/db.ts` uses `drizzle-orm/postgres-js` with `postgres` (v3.4.9). The
`postgres-js` driver creates a Node.js `net.Socket` on instantiation. The Vercel and Netlify
Edge runtimes do not expose Node.js `net` module; importing `postgres-js` in an Edge Function
causes a build-time error (`Module not found: Can't resolve 'net'`) or a runtime crash.

**Current deployment context:** The v0.1 production target is a self-hosted Next.js process
on a Hetzner VPS. In this configuration, `runtime = 'edge'` is not enforced by the platform —
Next.js will run the route in the Node.js process and the DB import works. The spec notes
"Netlify Edge Functions cold-start in ~50–100 ms" in §7(v), implying a Netlify Edge deployment
is anticipated.

**Risk:** If T26 ships as written and the deployment later moves to Netlify Edge or Vercel
(a stated v0.2 consideration per T04), the opengraph-image route will silently break. Social
crawlers will receive 500 errors; OG images will disappear across all project pages.

**Required fix (choose one):**

Option A — Drop Edge runtime (recommended for v0.1, lowest risk):
```typescript
// Remove or change:
export const runtime = 'edge'; // DELETE or change to 'nodejs'
```
The Node.js runtime supports `postgres-js` natively. Cold-start penalty on Hetzner VPS is
zero (persistent process). `revalidate = 3600` still sets CDN cache headers correctly.

Option B — Edge-compatible DB access via internal HTTP (correct for future Netlify Edge):
Replace the `getProjectDetail` call in `opengraph-image.tsx` with a `fetch` to an internal
API route (e.g. `GET /api/projects/[slug]/summary`) that runs in Node runtime and returns
JSON. The opengraph-image edge function then makes an HTTP call, not a DB call. This requires
a new API route (out of T26 scope unless the spec is expanded).

**Recommended spec text addition to §3.5 implementation notes:**
> "`runtime = 'edge'` is declared here but only safe on the current Hetzner VPS deployment
> (self-hosted Next.js uses Node runtime regardless of this export). `postgres-js` is
> incompatible with Vercel/Netlify Edge runtime. If the deployment target moves to a true
> edge platform, replace the DB import with an internal HTTP fetch to a `/api/projects/[slug]/summary`
> Node route. For v0.1 Hetzner VPS, this export is harmless."

---

## Non-blocking issues

### N-1 — `metadataBase` hardcoded; staging OG images point to production

**Spec §3.2 and §7(iv):** `metadataBase: new URL('https://karbonlens.com')` is hardcoded.
Staging/preview Netlify deploy URLs resolve OG image relative paths against production.

**Impact:** Acceptable for v0.1 (acknowledged in §7(iv)). However, the spec mentions adding
`NEXT_PUBLIC_SITE_URL` as a v0.2 item in §9 OQ-2 and §5, but does not add `NEXT_PUBLIC_SITE_URL`
to `.env.example`. If an implementer ever runs a preview deploy before reading §7(iv), the
broken OG behaviour is surprising with no clue in the env file.

**Recommendation:** Add `NEXT_PUBLIC_SITE_URL=https://karbonlens.com` (with comment) to
`.env.example` now, and change the spec's `metadataBase` line to:
```typescript
metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://karbonlens.com'),
```
This costs one line and eliminates the v0.2 migration task. The §9 OQ-2 open question is
then closed by the spec itself.

---

### N-2 — Fallback fetch in unknown-slug path uses production hardcoded URL

**Spec §3.5 unknown-slug fallback:**
```typescript
const fallbackUrl = 'https://karbonlens.com/og-image.png';
const res = await fetch(fallbackUrl);
```
On a preview deploy or local dev, this fetches the production static asset (if it exists) or
throws a network error (if DNS is unavailable in the sandbox). On local dev without internet,
the fallback silently fails and the response is a 500.

**Recommendation:** The fallback should use the same `NEXT_PUBLIC_SITE_URL ??
'https://karbonlens.com'` pattern, OR — better — directly redirect to the static image path:
```typescript
return Response.redirect(
  new URL('/og-image.png', process.env.NEXT_PUBLIC_SITE_URL ?? 'https://karbonlens.com')
);
```
A redirect is simpler than fetching and proxying the bytes. Social crawlers follow 302s.

---

### N-3 — `generateMetadata` calls `getProjectDetail` twice per request (documented but misframed)

**Spec §3.4:** "This is acceptable — Next.js deduplicates `fetch()` calls but not Drizzle
queries." Correct assessment. However, the framing "sub-5 ms on a warm DB connection" may
mislead. On a cold serverless connection (not the current Hetzner VPS context), the second
call adds a full round-trip to Postgres. This is not a v0.1 issue but the spec should not
present it as a universal fact.

**Recommendation:** Amend to: "On the current VPS deployment with a persistent connection
pool, the penalty is ~1–5 ms. On serverless platforms with per-request connections, the
penalty is a full DB round-trip (~20–50 ms). React `cache()` deduplication is the v0.2 fix."

---

### N-4 — `opengraph-image.tsx` filename convention: Next 16 discovers it as metadata image

**Spec §3.5:** "This file is discovered automatically by Next.js as an OG image route handler."
This is correct for Next.js 14+ and confirmed for 16.2.4. The file must be named exactly
`opengraph-image.tsx` (or `.js`, `.jsx`) at the route segment level. It must NOT be placed
inside a `(group)` subfolder below `[slug]` or in `api/` — the file placement in
`app/(app)/projects/[slug]/opengraph-image.tsx` is correct.

**Additional note missing from spec:** The `(app)` route group has a `layout.tsx` that
presumably wraps authenticated content (nav, sidebar). The `opengraph-image.tsx` file-convention
route does NOT inherit the route group layout — Next.js file-convention metadata routes are
layout-agnostic. This is actually correct behaviour (the OG image renderer should not render
the app shell), but the spec should explicitly note it to prevent a confused implementer from
trying to reference layout-level components.

**Recommendation:** Add: "`opengraph-image.tsx` does not inherit the `(app)` layout wrapper.
It is a bare function returning an `ImageResponse`, with no access to React context provided
by the layout. This is the correct behaviour."

---

### N-5 — Public route group access for opengraph-image sub-route

**Spec §3.5 and §6:** The middleware (confirmed in `middleware.ts`) marks `/projects`,
`/projects/[slug]`, `/prices`, `/regulatory` as full public access. The
`/projects/[slug]/opengraph-image` path is a sub-route of `/projects/[slug]`.

**Finding:** The middleware matcher confirmed "projects, /projects/[slug] — full public access."
The opengraph-image route at `/projects/katingan.../opengraph-image` is a child path and will
also pass through the middleware unauthenticated. Social crawlers can reach it without session
cookies. No issue; the spec's §7(viii) note about auth-gated pages does not apply here.

**Recommendation:** Add a single sentence to §3.5: "The middleware allows all
`/projects/[slug]/*` paths through unauthenticated; the opengraph-image route inherits this
and is reachable by social crawlers without session cookies."

---

### N-6 — `revalidate = 3600` semantics in Node runtime vs CDN

**Spec §3.5:** `export const revalidate = 3600;` and notes "sets `Cache-Control:
s-maxage=3600` header, allowing Netlify's CDN to serve stale responses."

**Reality check:** In Next.js App Router, `revalidate` on a route segment handler controls
ISR (Incremental Static Regeneration) revalidation for page routes. For file-convention
metadata image routes (opengraph-image), `revalidate` sets the `Cache-Control` `s-maxage`
and `stale-while-revalidate` headers. On Hetzner VPS without a CDN, this header is emitted
but not acted upon — there is no intermediate cache. On Netlify with CDN, the CDN will respect
`s-maxage=3600`. This is correct for the expected deployment path, but on the current VPS the
cache has zero effect. The spec should note: "`revalidate = 3600` is effective only when a
CDN layer (Netlify, Cloudflare, Fastly) sits in front of the Next.js server. On the bare-metal
Hetzner VPS in v0.1, the header is emitted but the OS or process cache does not act on it —
every request hits the Node handler."

---

### N-7 — `fontFamily: 'IBM Plex Sans, sans-serif'` in ImageResponse JSX has no effect

**Spec §3.5 JSX:** `fontFamily: 'IBM Plex Sans, sans-serif'` is specified in the root div
style. Per the Next.js `ImageResponse` / Satori docs, the `fontFamily` CSS property in
`ImageResponse` JSX only has effect when the named font is provided in the `fonts` array of
the `ImageResponse` options. If the font is not provided, the Satori renderer falls back to
its bundled "Noto Sans" (not system default, not IBM Plex Sans). The spec says "uses system
`sans-serif` as fallback" — this is imprecise. The actual fallback font is Satori's built-in
Noto Sans, not the OS system font. The visual result is readable but brand-inconsistent.

This is explicitly accepted as a v0.1 trade-off in §9 OQ-1. The issue here is precision: the
spec text should say "Satori's built-in Noto Sans" rather than "system default", because
different readers interpret "system default" as the OS font stack (which is never used inside
`ImageResponse`).

**Recommendation:** Amend §3.5 implementation note and §9 OQ-1 to read: "If no `fonts` array
is provided, Satori uses its bundled Noto Sans (not the OS system font). The result is
readable but does not match the IBM Plex Sans brand typeface."

---

## Confirmed-correct findings (adversarial checks that passed)

**OG image dimensions:** `legacy/prototype/og-image.png` is confirmed 1200×630 px RGBA PNG,
493,978 bytes (~483 KB). Spec claims "1200×630 px, 493 KB" — accurate within rounding.

**Twitter Card minimum dimensions:** `summary_large_image` requires minimum 300×157 px;
1200×630 satisfies this. Per-project dynamic image at 1200×630 also satisfies. No issue.

**og:image URL resolution:** `metadataBase: new URL('https://karbonlens.com')` + relative
`/og-image.png` = `https://karbonlens.com/og-image.png`. Social crawlers require fully
qualified URLs; `metadataBase` plus relative path resolves correctly per Next.js Metadata API.
Confirmed valid.

**`opengraph-image` sub-route not present in current codebase:** `ls app/(app)/projects/[slug]/`
shows only `loading.tsx`, `not-found.tsx`, `page.tsx`. The `opengraph-image.tsx` file is a
new file — no conflict with existing code. Clean.

**`Props` type compatibility:** `page.tsx` defines `Props` as `{ params: Promise<{ slug:
string }>; searchParams: ... }`. The spec's `generateMetadata` signature uses `{ params:
Props['params'] }` (or equivalent). This is compatible. `generateMetadata` does not receive
`searchParams` and that parameter is optional in Next.js. No type conflict.

**`notFound()` separation:** Spec correctly separates `generateMetadata` (returns `{}` for
unknown slugs) from the page render body (calls `notFound()`). This prevents a double-throw
race. The note "do not also throw from generateMetadata" is architecturally correct for
Next.js 16.

**Score pill alpha hack (`scorePillColor + '22'`):** Valid only for 6-digit hex strings. All
four `scorePillColor` values in the spec (`#888780`, `#0f6e56`, `#854f0b`, `#a32d2d`) are
6-digit hex. The `+ '22'` suffix correctly produces an 8-digit hex with ~13% alpha. No issue.

**`@vercel/og` absence:** `package.json` does not include `@vercel/og`. The spec correctly
imports from `next/og` (bundled in Next.js 16.2.4). Confirmed compatible.

---

## Cross-story coordination with T25

T25 (landing redesign) owns `app/(public)/page.tsx` render body. T26 adds `export const
metadata` to that file. The T25 spec audit (T25-spec-audit.md) confirmed: "T25 must not add a
`generateMetadata` export or `export const metadata` to `app/(public)/page.tsx` — that is
T26's responsibility." No conflict is anticipated provided both stories are merged in order
(T25 first, T26 second as declared by `blocked_by: [T25]`).

**Landing metadata values:** The T25 spec audit noted T25 may revise the hero title and
description. T26 §2 and §3.3 correctly acknowledge this with "implementer must verify against
T25's final copy." No fix needed; the dependency is documented.

**Merge conflict risk on `app/layout.tsx`:** T25 does not modify `app/layout.tsx` (confirmed
in T25 §6 file ownership: "No `<head>` hard-coding, no changes to `app/layout.tsx`"). T26
exclusively owns the `metadata` export replacement in `layout.tsx`. Zero merge conflict risk.

---

## Edge-runtime DB feasibility summary

`getProjectDetail` in `opengraph-image.tsx` calls `lib/db.ts` which uses `postgres-js`. This
driver is **Node.js-only**. On the current Hetzner VPS (self-hosted, persistent Node process),
`export const runtime = 'edge'` is a declaration but the platform does not enforce it — the
route runs in Node and the DB import succeeds. On Netlify Edge Functions or Vercel Edge,
this import fails at build time. The spec must add a deployment-context caveat (see B-1).
For a true edge-compatible implementation, replace the direct DB import with an HTTP fetch
to an internal Node API route. For v0.1 Hetzner VPS, Option A (remove or ignore
`runtime = 'edge'`) is sufficient and lowest risk.

---

## Definition of done — additions required

The following items should be resolved in the spec before implementation:

- [ ] §3.5: Add deployment-context caveat for `runtime = 'edge'` + `postgres-js`
  incompatibility (B-1). Either switch to `runtime = 'nodejs'` for v0.1 or document the
  edge-compatible alternative.
- [ ] §3.2 / §5 `.env.example`: Add `NEXT_PUBLIC_SITE_URL` env var and use it in
  `metadataBase` (N-1 recommendation, closes OQ-2).
- [ ] §3.5 unknown-slug fallback: Replace proxy-fetch pattern with `Response.redirect` using
  `NEXT_PUBLIC_SITE_URL` env var (N-2).
- [ ] §3.5 implementation notes: Clarify Satori's bundled Noto Sans fallback rather than
  "system font" (N-7, also update §9 OQ-1).
- [ ] §3.5 implementation notes: Add note that `opengraph-image.tsx` does not inherit the
  `(app)` layout wrapper (N-4).
- [ ] §3.5: Add note confirming middleware allows `/projects/[slug]/*` paths
  unauthenticated, including the opengraph-image sub-route (N-5).
