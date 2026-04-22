---
id: T26-implementation-report
story: T26
title: "Implementation report — Social preview (OG + Twitter cards)"
implementer: Claude Opus 4.7 (1M context)
date: 2026-04-22
worktree: /root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-ad7e992f
branch: agent/T26-social-preview
base: feature/v0.1-impl @ af9d05e
---

## Acceptance criteria

| AC   | Description                                                              | Status | Evidence |
|------|--------------------------------------------------------------------------|--------|----------|
| AC-1 | Landing page has OG + Twitter meta tags                                  | PASS   | `curl /` emits `og:title`, `og:description`, `og:url`, `twitter:card=summary_large_image`, `twitter:image=https://karbonlens.com/og-image.png`. |
| AC-2 | `public/og-image.png` reachable, `image/png`, >100 KB                    | PASS   | `curl -sI /og-image.png` → 200, `Content-Type: image/png`, `Content-Length: 493978` (493 KB). |
| AC-3 | Per-page OG titles include `<page> · KarbonLens`                         | PASS   | `/projects` → "Projects · KarbonLens"; `/prices` → "Prices · KarbonLens"; `/regulatory` → "Regulatory · KarbonLens"; `/alerts` → "Alerts inbox · KarbonLens". Landing uses the full bypass string. |
| AC-4 | `/projects/[slug]/opengraph-image` serves PNG >5 KB                      | PASS   | Next 16 emits the image at a hashed path. The production build surfaces `/projects/[slug]/opengraph-image-j059r5` → 200, `image/png`, 49,761 bytes for the Katingan slug. Next auto-injects the hashed URL into HTML meta tags. |
| AC-5 | Project HTML references dynamic OG image, twitter:card, project name    | PASS   | `curl /projects/katingan-peatland-.../` emits `og:image` with the hashed route URL, `og:title=Katingan Peatland Restoration and Conservation Project`, `twitter:card=summary_large_image`. |
| AC-6 | Unknown slug → opengraph-image does not 500                              | PASS   | `curl /projects/no-such-project/opengraph-image-j059r5` → 200, `image/png`, 21,201 bytes (fallback wordmark image). `getProjectSummary` returns `null` and the handler returns the fallback `ImageResponse`. |
| AC-9 | `npm run build` + `npx tsc --noEmit` exit 0                              | PASS   | Build compiled successfully in 28–30s; `opengraph-image-j059r5` and `twitter-image-j059r5` routes appear in the manifest. `tsc --noEmit` exits 0. |

Manual-verification ACs (AC-7 opengraph.xyz, AC-8 Slack/WhatsApp) are Andy's post-merge checks.

## Files changed

- `public/og-image.png` — NEW, 493,978 bytes, copied from `legacy/prototype/og-image.png`.
- `app/layout.tsx` — `export const metadata` replaced with full `metadataBase`, `title` template, `description`, `openGraph`, `twitter` shape.
- `app/(public)/page.tsx` — added `export const metadata` with full bypass title + OG block.
- `app/(app)/projects/page.tsx` — added `export const metadata` (title "Projects" template-applied).
- `app/(app)/prices/page.tsx` — added `export const metadata` (title "Prices").
- `app/(app)/regulatory/page.tsx` — added `export const metadata` next to the existing `export const dynamic = 'force-dynamic'`.
- `app/(app)/alerts/page.tsx` — added `export const metadata` with `robots: { index: false }`.
- `app/(app)/projects/[slug]/page.tsx` — added `export async function generateMetadata` above the render body; render body untouched.
- `lib/queries/project-summary.ts` — NEW, lightweight `getProjectSummary(slug)` helper joining `projects` with the latest `project_scores` row via `LEFT JOIN … ORDER BY score_date DESC LIMIT 1`.
- `app/(app)/projects/[slug]/opengraph-image.tsx` — NEW, Satori JSX 1200×630 PNG generator, Node runtime, `revalidate = 3600`, try/catch → fallback wordmark image.
- `app/(app)/projects/[slug]/twitter-image.tsx` — NEW, re-exports `default`, `size`, `contentType`, `alt` from `./opengraph-image`. `revalidate` is declared locally (Next 16 forbids re-exporting route-segment config fields).

Methodology page (`app/(public)/methodology/page.tsx`) was skipped per task gating — the file did not exist at implementation time (T24 has not merged).

## Tested slugs

- `katingan-peatland-restoration-and-conservation-project` (real DB row) — 49,761-byte PNG returned.
- `no-such-project` (fabricated) — 21,201-byte fallback PNG returned; never 500.

## Deviations from spec

1. **Generated-metadata `images` field omitted for project pages.** Spec §3.4 calls for
   `openGraph.images: [{ url: '/projects/${slug}/opengraph-image', ... }]`. Next.js 16's
   file-convention router serves the opengraph-image route at a hashed path
   (`opengraph-image-<hash>`), not the bare path. Passing the bare URL as an explicit
   `images` array produced working HTML meta tags that 404'd when crawlers fetched them.
   Removing the explicit `images` field lets Next auto-inject the correct hashed URL from
   the colocated `opengraph-image.tsx` file convention — the HTML meta tag then points at
   `…/opengraph-image-j059r5?6afd949a1d2c106d` which returns 200 + PNG. The `og:image:alt`
   text the spec wanted is emitted by Next from the `alt` export in `opengraph-image.tsx`.
   Documented inline in the `generateMetadata` function.

2. **`twitter-image.tsx` re-exports via `export { … } from`.** Spec §3 asked for a 1-line
   re-export. Next 16 rejects re-exporting `revalidate` from a route-segment-config file
   (error: "Next.js can't recognize the exported `revalidate` field in route. It mustn't
   be reexported."). Compromise: re-export `default`, `size`, `contentType`, `alt`, and
   redeclare `revalidate = 3600` locally. Functionally identical; two lines instead of one.

3. **`getProjectSummary` includes `projectType`.** The spec's type shape has
   `{ name, score, province, hectares, statusBadge }`. The task-level description string
   renders `${project.projectType ?? 'Carbon'} project in ${province}`, so `projectType`
   was added to the same single query (no extra round-trip). The OG image renderer ignores it.

4. **Worktree bootstrap.** The worktree was initialised on a stray branch
   `worktree-agent-ad7e992f` pointing at `main@fdb3349` (the prototype tree).
   Checked out a fresh branch `agent/T26-social-preview` from `af9d05e` (the declared
   feature base). `node_modules` was symlinked from the parent repo;
   `.env.local` copied from the parent for build + runtime tests and then left in place
   (it is `.gitignore`d, so it will not land in the commit).

## Fallback behavior

The `opengraph-image.tsx` handler wraps its entire body in `try/catch`. Two paths feed
`fallback()`:

- `getProjectSummary(slug)` returns `null` (unknown slug).
- Any unexpected throw inside the render (Satori crash, DB timeout, transient error).

`fallback()` returns a 1200×630 `ImageResponse` with the KarbonLens wordmark centered on
the dark canvas. No redirect, no network round-trip. Social crawlers receive a valid PNG
regardless of upstream state.

## Constraints honoured

- `lib/score.ts`, `lib/db.ts`, `lib/schema.ts`, `lib/auth.ts`, `proxy.ts` — not touched.
- No render-body edits to any `page.tsx` — only added/modified the `metadata` /
  `generateMetadata` exports plus required imports.
- No `export const runtime = 'edge'` declaration. Node runtime (default) is what
  `postgres-js` + `lib/db.ts` require.

## T26 follow-ups

- **N-6 `robots: {index:false}` on /alerts** — Positive deviation; the setting is correct for a
  personalised surface that should not be indexed. Keep as-is. Update spec in a minor doc pass
  (T26 spec §3 currently omits the robots override).

- **Cold-start cost (~500ms–2s first crawl per slug)** — The `opengraph-image.tsx` route incurs a
  DB round-trip on the first request per slug (before `revalidate = 3600` kicks in). This is
  acceptable at current traffic; noted here so it is visible if crawl-budget or TTFB targets are
  tightened in v0.2.

- **`/methodology` metadata deferred → T26.1** — `app/(public)/methodology/page.tsx` did not exist
  at T26 implementation time (T24 had not landed). Metadata for /methodology is deferred to a
  T26.1 follow-up ticket; create after T24 merges.

- **`Cache-Control` on ImageResponse** — Next.js sets `public, max-age=0, must-revalidate` at the
  origin for `ImageResponse` routes. The `revalidate = 3600` export controls Next's internal ISR
  revalidation window, not the downstream CDN TTL. Add a proper `s-maxage` / `stale-while-revalidate`
  header when a CDN layer is introduced (planned for v0.2 if needed).
