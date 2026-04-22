---
id: T26
title: Social preview (OG + Twitter cards)
phase: 5-polish
status: draft
blocked_by: [T25]
blocks: []
owner: spec-writer agent
effort_estimate: 2.5h
---

## 1. User story

As a KarbonLens user or researcher sharing a link to the platform on Slack, WhatsApp, LinkedIn, or Twitter/X, I want every page to unfurl with a rich preview — correct title, description, and image — so that recipients understand what they're about to open and click through at a higher rate.

---

## 2. Context & rationale

KarbonLens v0.1 is fully public. Link-sharing is the primary organic acquisition vector in the near term: researchers share project dossiers with colleagues, Andy shares prices on a Slack thread, and journalists link to the regulatory timeline. Currently, any shared URL renders as a bare URL with no preview because `app/layout.tsx` exports only a minimal `title` + `description` and no OG/Twitter metadata.

The legacy prototype (`legacy/prototype/index.html` lines 9–30) already demonstrated the correct tag set and copy. Those tags are migrated verbatim where appropriate and extended to per-page and per-project granularity.

T25 (hero copy refresh) may change the landing title and description before this story ships. T26 reads its landing copy from the outcome of T25 — `blocked_by: [T25]`. The implementer must verify the landing metadata against whatever T25 ships; the values specified here are the currently-correct fallback (matching the prototype).

Next.js 16.2.4 bundles `ImageResponse` inside `next/og` — **no separate `@vercel/og` package is required or installed**. The import path is:

```typescript
import { ImageResponse } from 'next/og';
```

This is confirmed by the Next.js 16 changelog and the absence of `@vercel/og` in `package.json`. Do not add `@vercel/og` as a dependency.

---

## 3. Scope

### In scope

1. **Copy `legacy/prototype/og-image.png` → `public/og-image.png`.**

   The legacy image is 1200×630 px, 493 KB. Bash command:
   ```bash
   cp legacy/prototype/og-image.png public/og-image.png
   ```
   This becomes the site-wide static fallback OG image, served at `https://karbonlens.com/og-image.png`.

2. **Site-wide metadata defaults in `app/layout.tsx`.**

   Replace the existing minimal `export const metadata: Metadata = { ... }` with a fully-populated object. Required shape:

   ```typescript
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     metadataBase: new URL('https://karbonlens.com'),
     title: {
       default: "KarbonLens — Indonesia's carbon market, in one terminal",
       template: '%s · KarbonLens',
     },
     description:
       'Satellite MRV, prices, reversal alerts, and regulatory tracking — unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon.',
     openGraph: {
       siteName: 'KarbonLens',
       locale: 'en_US',
       type: 'website',
       images: [
         {
           url: '/og-image.png',
           width: 1200,
           height: 630,
           alt: 'KarbonLens satellite monitor — Katingan peatland with live RADD deforestation alerts',
         },
       ],
     },
     twitter: {
       card: 'summary_large_image',
       images: ['/og-image.png'],
     },
   };
   ```

   - `metadataBase` must be set so that relative `/og-image.png` paths resolve correctly on social crawlers.
   - The title `template` causes per-page `title: "Prices"` to render as `"Prices · KarbonLens"` in the browser tab and OG tags.
   - `og:locale:alternate` (`id_ID`) from the prototype is intentionally omitted from the Next.js Metadata object because the Metadata API does not support `og:locale:alternate` natively and there is no Indonesian localisation in v0.1.

3. **Per-page `export const metadata` overrides.**

   Each file listed below gets a page-level `export const metadata: Metadata = { ... }` export. The `openGraph.url` canonical must use the absolute path without trailing slash, consistent with `metadataBase`.

   | Route | File | `title` | `description` |
   |---|---|---|---|
   | `/` | `app/(public)/page.tsx` | `"KarbonLens — Indonesia's carbon market, in one terminal"` (full, overrides template) | `"Satellite MRV, prices, reversal alerts, and regulatory tracking — unified across Verra, SRN-PPI, Gold Standard, and IDXCarbon."` |
   | `/projects` | `app/(app)/projects/page.tsx` | `"Projects"` | `"64 Indonesian carbon projects — integrity scores, satellite alerts, issuance history."` |
   | `/prices` | `app/(app)/prices/page.tsx` | `"Prices"` | `"IDXCarbon monthly volume, value, and average price — last 10 months."` |
   | `/regulatory` | `app/(app)/regulatory/page.tsx` | `"Regulatory"` | `"Indonesian carbon-market regulations — bilingual summaries, importance and tags filter."` |
   | `/alerts` | `app/(app)/alerts/page.tsx` | `"Alerts inbox"` | `"Your personalised deforestation-alert digest."` |
   | `/methodology` | `app/(app)/methodology/page.tsx` (T24) | `"Methodology"` | `"How KarbonLens computes the v1 integrity score — validation, reversal risk, community flags, transparency."` |

   Notes:
   - **Landing page**: `title` is the full string (not just `"KarbonLens"`) so the template is bypassed; add `openGraph: { url: 'https://karbonlens.com', images: [{ url: '/og-image.png', width: 1200, height: 630, alt: '...' }] }`.
   - **Projects, prices, regulatory, alerts**: use the short-form `title` string so Next.js applies the `template` → `"Projects · KarbonLens"` etc. Include `openGraph: { url: '/projects' }` (relative; resolved by `metadataBase`).
   - **Methodology**: this page is owned by T24. T26 may add the `export const metadata` only if T24 has landed; if T24 has not yet merged, add a `// TODO T26: add metadata once T24 lands` comment in the T24 stub and document in the PR description.
   - **Auth-gated pages** (`/alerts`): the OG metadata is still valuable — social crawlers see it (no cookie), and unauthenticated previews show the page intent. Do not gate the metadata export behind auth.

4. **Per-project dynamic metadata via `generateMetadata` in `app/(app)/projects/[slug]/page.tsx`.**

   Add `export async function generateMetadata({ params }: Props): Promise<Metadata>` **above** the existing `export default async function ProjectDetailPage` — do not touch the render body.

   ```typescript
   export async function generateMetadata({ params }: Props): Promise<Metadata> {
     const { slug } = await params;
     const detail = await getProjectDetail(slug);
     if (!detail) return {};

     const { project, score } = detail;
     const integrityScore =
       score?.integrityScore != null
         ? Number(score.integrityScore).toFixed(1)
         : null;

     const title = project.nameCanonical;
     const description = [
       `${project.projectType ?? 'Carbon'} project`,
       `in ${project.province ?? 'Indonesia'}`,
       integrityScore != null ? `· Score ${integrityScore}` : null,
       `· Developer ${project.developer ?? 'n/a'}`,
       `· ${Number(project.totalVcusIssued ?? 0).toLocaleString('en-ID')} tCO₂e issued`,
     ]
       .filter(Boolean)
       .join(' ');

     const ogImageUrl = `/projects/${slug}/opengraph-image`;

     return {
       title,
       description,
       openGraph: {
         title,
         description,
         url: `/projects/${slug}`,
         images: [
           {
             url: ogImageUrl,
             width: 1200,
             height: 630,
             alt: `${project.nameCanonical} — KarbonLens integrity score`,
           },
         ],
       },
       twitter: {
         card: 'summary_large_image',
         title,
         description,
         images: [ogImageUrl],
       },
     };
   }
   ```

   - `getProjectDetail` is already called by the render body; it is called twice per request in v0.1 (once in `generateMetadata`, once in the page body). This is acceptable — Next.js deduplicates `fetch()` calls but not Drizzle queries. The performance penalty is minimal (sub-5 ms on a warm DB connection). Deduplication via React `cache()` is a v0.2 optimisation.
   - Return `{}` (empty metadata, inheriting layout defaults) for unknown slugs — `notFound()` is called in the render body; `generateMetadata` should not also throw.

5. **Dynamic OG image at `app/(app)/projects/[slug]/opengraph-image.tsx`.**

   This file is discovered automatically by Next.js as an OG image route handler for `/projects/[slug]/opengraph-image`. It must export `generateImageMetadata` is optional; at minimum export a default function with the correct signature.

   ```typescript
   import { ImageResponse } from 'next/og';
   import { getProjectDetail } from '@/lib/queries/project-detail';

   export const runtime = 'edge';
   export const revalidate = 3600; // 1-hour CDN cache

   export const size = { width: 1200, height: 630 };
   export const contentType = 'image/png';

   export default async function Image({
     params,
   }: {
     params: Promise<{ slug: string }>;
   }) {
     const { slug } = await params;
     const detail = await getProjectDetail(slug);

     // Unknown slug: return the static fallback image.
     if (!detail) {
       // Fetch the static og-image.png from the same origin.
       // In Edge runtime, absolute URL is required.
       const fallbackUrl = 'https://karbonlens.com/og-image.png';
       const res = await fetch(fallbackUrl);
       const buf = await res.arrayBuffer();
       return new Response(buf, {
         headers: {
           'Content-Type': 'image/png',
           'Cache-Control': 'public, max-age=3600, s-maxage=3600',
         },
       });
     }

     const { project, score } = detail;
     const integrityScore =
       score?.integrityScore != null
         ? Number(score.integrityScore).toFixed(1)
         : null;

     // Score bucket → pill color mapping (mirrors ScoreCard thresholds).
     // Bucket: ≥70 success-fg, ≥40 warning-fg, <40 danger-fg, null → neutral.
     const scorePillColor =
       integrityScore == null
         ? '#888780'        // --color-text-3 (neutral)
         : Number(integrityScore) >= 70
           ? '#0f6e56'      // --color-success-fg
           : Number(integrityScore) >= 40
             ? '#854f0b'    // --color-warning-fg
             : '#a32d2d';  // --color-danger-fg

     const name =
       project.nameCanonical.length > 60
         ? project.nameCanonical.slice(0, 57) + '…'
         : project.nameCanonical;

     const subline = [
       project.province ?? 'Indonesia',
       project.hectares != null
         ? `${Number(project.hectares).toLocaleString('en-ID')} ha`
         : null,
     ]
       .filter(Boolean)
       .join(' · ');

     return new ImageResponse(
       (
         <div
           style={{
             display: 'flex',
             flexDirection: 'column',
             justifyContent: 'space-between',
             width: 1200,
             height: 630,
             background: '#0F1411',
             padding: '56px 72px',
             fontFamily: 'IBM Plex Sans, sans-serif',
           }}
         >
           {/* Top: wordmark */}
           <div
             style={{
               display: 'flex',
               alignItems: 'center',
               gap: 10,
               color: '#0f6e56',
               fontSize: 20,
               fontWeight: 500,
               letterSpacing: '0.5px',
               textTransform: 'uppercase',
             }}
           >
             KarbonLens
           </div>

           {/* Centre: project name + score pill */}
           <div
             style={{
               display: 'flex',
               flexDirection: 'column',
               gap: 20,
             }}
           >
             <div
               style={{
                 color: '#fafaf7',
                 fontSize: 56,
                 fontWeight: 500,
                 lineHeight: 1.1,
               }}
             >
               {name}
             </div>

             <div
               style={{
                 display: 'flex',
                 alignItems: 'center',
                 gap: 16,
               }}
             >
               {/* Score pill */}
               <div
                 style={{
                   display: 'flex',
                   alignItems: 'center',
                   background: scorePillColor + '22',
                   border: `1.5px solid ${scorePillColor}`,
                   borderRadius: 8,
                   padding: '6px 16px',
                   color: scorePillColor,
                   fontSize: 22,
                   fontWeight: 600,
                 }}
               >
                 {integrityScore != null ? `Score ${integrityScore}` : 'Score —'}
               </div>

               {/* Province + hectares */}
               <div
                 style={{
                   color: '#888780',
                   fontSize: 20,
                 }}
               >
                 {subline}
               </div>
             </div>
           </div>

           {/* Bottom: URL footer */}
           <div
             style={{
               color: '#5f5e5a',
               fontSize: 16,
               letterSpacing: '0.3px',
             }}
           >
             KarbonLens.com
           </div>
         </div>
       ),
       {
         width: 1200,
         height: 630,
       },
     );
   }
   ```

   Implementation notes:
   - `export const runtime = 'edge'` is **required**. `ImageResponse` uses the Web Streams API and runs in the Edge runtime. The Node.js runtime will also work but cold-starts are slower on Netlify.
   - Custom fonts (IBM Plex Sans) cannot be loaded from Google Fonts at edge cold-start time within the response budget. The design uses system `sans-serif` as fallback; the visual result is acceptable for an OG image. If the implementer wants to embed a font subset, use the pattern in Next.js docs (fetch a `.ttf` and pass to `ImageResponse` options `fonts` array) — but this is optional for v0.1.
   - The fallback path for unknown slug avoids a 500 by streaming the static PNG. This path also guards against slug injection.
   - `revalidate = 3600` sets the `Cache-Control: s-maxage=3600` header, allowing Netlify's CDN to serve stale responses while revalidating. Social crawlers re-fetch at most once per crawl cycle; this is a safe tradeoff.
   - The `background: scorePillColor + '22'` trick appends an 8-bit alpha hex (`22` ≈ 13% opacity) to produce a tinted background behind the score pill. This works because all `scorePillColor` values are 6-digit hex.

6. **Optional: `app/(app)/projects/[slug]/twitter-image.tsx`.**

   Twitter/X crawlers read `og:image` before `twitter:image` when both are present; the `generateMetadata` function already populates both. A `twitter-image.tsx` route convention file would override `twitter:image` independently. For v0.1, omit `twitter-image.tsx` — the single `opengraph-image.tsx` route is sufficient. Add a `// TODO v0.2: twitter-image.tsx` comment in `opengraph-image.tsx` if desired.

### Out of scope (explicit non-goals)

- **OG images for non-project pages** — `/prices`, `/regulatory`, `/alerts`, and `/` use the static `og-image.png` fallback. Per-page dynamic OG image generation is a v0.2 item.
- **`og:locale:alternate` (id_ID)** — no Indonesian localisation exists in v0.1.
- **Structured data / JSON-LD** — deferred to v0.2.
- **Sitemap / `robots.txt` changes** — separate concerns; not in scope.
- **Twitter/X `@username`** — no official KarbonLens Twitter account; omit `twitter:site`.
- **Modifying the render body of `ProjectDetailPage`** — T12 and the 2026-04-22 open-up change own that code. `generateMetadata` is inserted above the default export only.
- **Changing landing page content** — T25 owns `/` content; T26 only adds the `export const metadata` export.

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Landing page has OG + Twitter meta tags**
```
Given the site is deployed to https://karbonlens.com
When curl -sS https://karbonlens.com/ is run
Then the response HTML contains all of:
  <meta property="og:title"
  <meta property="og:description"
  <meta property="og:image"
  <meta property="og:url"
  <meta name="twitter:card" content="summary_large_image"
  <meta name="twitter:image"
```

**AC-2: Static OG image is publicly accessible**
```
Given public/og-image.png has been deployed
When curl -sI https://karbonlens.com/og-image.png is run
Then the response status is 200
  And the Content-Type header is image/png
  And the Content-Length header is greater than 100000 (>100 KB)
```

**AC-3: Per-page OG titles are page-specific**
```
Given the site is deployed
When curl -sS https://karbonlens.com/prices is run
Then the response HTML contains og:title with value "Prices · KarbonLens"
When curl -sS https://karbonlens.com/regulatory is run
Then the response HTML contains og:title with value "Regulatory · KarbonLens"
When curl -sS https://karbonlens.com/projects is run
Then the response HTML contains og:title with value "Projects · KarbonLens"
When curl -sS https://karbonlens.com/alerts is run
Then the response HTML contains og:title with value "Alerts inbox · KarbonLens"
```

**AC-4: Per-project dynamic OG image route is reachable and returns a PNG**
```
Given slug "katingan-peatland-restoration-and-conservation-project" exists in the DB
When curl -sI https://karbonlens.com/projects/katingan-peatland-restoration-and-conservation-project/opengraph-image is run
Then the response status is 200
  And the Content-Type header is image/png
  And the Content-Length header is greater than 5000 (>5 KB)
```

**AC-5: Per-project page HTML references the dynamic OG image**
```
Given the same slug as AC-4
When curl -sS https://karbonlens.com/projects/katingan-peatland-restoration-and-conservation-project is run
Then the response HTML contains og:image pointing to .../opengraph-image
  And the response HTML contains og:title equal to the project's nameCanonical
  And the response HTML contains twitter:card content="summary_large_image"
```

**AC-6: Unknown slug → opengraph-image returns fallback, not 500**
```
Given slug "does-not-exist-zzz" does not exist in the DB
When curl -sI https://karbonlens.com/projects/does-not-exist-zzz/opengraph-image is run
Then the response status is 200 or 404 (not 500)
  And if 200, Content-Type is image/png
```

**AC-7: Social card validator renders cleanly**
```
Given the site is deployed
When the landing URL https://karbonlens.com is entered at https://www.opengraph.xyz
  And a project URL https://karbonlens.com/projects/katingan-peatland-restoration-and-conservation-project is entered at https://www.opengraph.xyz
Then both pages render with a visible title, description, and image preview
  (manual eyeball verification — no automated test)
```

**AC-8: Slack/WhatsApp smoke test**
```
Given both URLs from AC-7
When the landing URL is pasted into a Slack DM
  And the project URL is pasted into a WhatsApp chat
Then both links unfurl with title + description + image
  (manual verification by Andy — documented in PR description)
```

**AC-9: Build is clean**
```
Given all T26 changes are committed
When npm run build is run
Then exit code is 0
When npx tsc --noEmit is run
Then exit code is 0 with no type errors
```

---

## 5. Inputs & outputs

**Inputs:**
- `legacy/prototype/og-image.png` — source image to copy.
- `legacy/prototype/index.html` lines 9–30 — reference OG/Twitter tag set and copy.
- `lib/queries/project-detail.ts` — `getProjectDetail(slug)` returns `ProjectDetail | null`; `project.nameCanonical`, `project.projectType`, `project.province`, `project.hectares`, `project.developer`, `project.totalVcusIssued`; `score.integrityScore`.
- `app/layout.tsx` — existing minimal metadata export to be replaced.
- `app/(public)/page.tsx`, `app/(app)/projects/page.tsx`, `app/(app)/prices/page.tsx`, `app/(app)/regulatory/page.tsx`, `app/(app)/alerts/page.tsx` — receive new `export const metadata` export.
- `app/(app)/projects/[slug]/page.tsx` — receives new `generateMetadata` export above the render function.

**Outputs / files changed:**
- `public/og-image.png` — copied from legacy (new file).
- `app/layout.tsx` — updated `export const metadata`.
- `app/(public)/page.tsx` — new `export const metadata` export added.
- `app/(app)/projects/page.tsx` — new `export const metadata` export added.
- `app/(app)/prices/page.tsx` — new `export const metadata` export added.
- `app/(app)/regulatory/page.tsx` — new `export const metadata` export added.
- `app/(app)/alerts/page.tsx` — new `export const metadata` export added.
- `app/(app)/methodology/page.tsx` — new `export const metadata` export added (conditional on T24 landing; see §3.3 note).
- `app/(app)/projects/[slug]/opengraph-image.tsx` — new file.
- `app/(app)/projects/[slug]/page.tsx` — `generateMetadata` function added above `ProjectDetailPage`.

**Env vars:** None. `metadataBase` is hard-coded to `https://karbonlens.com`. If a staging URL is needed for preview deploys, set `NEXT_PUBLIC_SITE_URL` and use `new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://karbonlens.com')` — this is an implementation decision left to the implementer.

---

## 6. Dependencies & interactions

- **Blocked by T25** — T25 may revise the landing hero title/description. T26's landing metadata must match T25's final copy. Implementer must verify after T25 merges.
- **Does not block** any current open story.
- **T24 (methodology page)** — T26 adds metadata to T24's page. If T24 has not yet merged when T26 is implemented, the implementer adds a `// TODO T26: add metadata once T24 lands` comment in the T24 page file and does not create `app/(app)/methodology/page.tsx` in this story.
- **T12 (project detail page)** — T26 adds `generateMetadata` above the render body only. The render body is not touched. Implementer must confirm the `Props` type (already typed as `{ params: Promise<{ slug: string }>; ... }`) is compatible with `generateMetadata`'s signature.
- **File ownership (strict, to prevent merge conflicts):**
  - `public/og-image.png` — T26 owns (new file).
  - `app/layout.tsx` — T26 owns the `metadata` export only; font configuration is untouched.
  - `app/(public)/page.tsx` — T26 adds metadata export only; T25 owns content/render body.
  - `app/(app)/projects/page.tsx` — T26 adds metadata export only; T11 owns render body.
  - `app/(app)/prices/page.tsx` — T26 adds metadata export only.
  - `app/(app)/regulatory/page.tsx` — T26 adds metadata export only.
  - `app/(app)/alerts/page.tsx` — T26 adds metadata export only.
  - `app/(app)/projects/[slug]/page.tsx` — T26 adds `generateMetadata` only; T12 owns `ProjectDetailPage`.
  - `app/(app)/projects/[slug]/opengraph-image.tsx` — T26 owns (new file).

---

## 7. Edge cases & failure modes

**(i) Unknown project slug → opengraph-image route.**
`getProjectDetail` returns `null`. The handler must not call `notFound()` (which throws a Next.js internal redirect not catchable in this route type in Next 16 Edge). Instead, return the static fallback PNG via a `fetch()` + `Response` — see §3.5 implementation. Confirm that the fetch of `https://karbonlens.com/og-image.png` does not create a circular dependency (it should not; `og-image.png` is a static file served from `public/`, not a Next.js route).

**(ii) Project name longer than 60 characters.**
Truncate to 57 characters and append `…` (Unicode ellipsis `…`). The JSX in `opengraph-image.tsx` does not word-wrap automatically; the 1200 px canvas at 56 px font size fits approximately 25–30 characters per line. The truncation cap (60) is conservative; the implementer may adjust based on visual testing.

**(iii) Project with no integrity score.**
`score` may be `null` (project not yet scored) or `score.integrityScore` may be `null`. Both cases → display `"Score —"` in the OG image pill and omit the score from the `generateMetadata` description segment. The pill uses the neutral colour `#888780`.

**(iv) `metadataBase` mismatch in preview deployments.**
Netlify preview deploy URLs (e.g. `https://deploy-preview-26--karbonlens.netlify.app`) will resolve OG images against the hardcoded `metadataBase` (`https://karbonlens.com`), so OG tags on preview deploys point to production images. This is acceptable for v0.1 — preview deploys are not shared publicly. A `NEXT_PUBLIC_SITE_URL` env var can fix this in v0.2.

**(v) ImageResponse cold-start on Netlify Edge.**
Netlify Edge Functions cold-start in ~50–100 ms. Social crawlers (Slack, WhatsApp, Twitter) typically wait up to 5 s for a response. `revalidate = 3600` ensures the CDN serves the cached response on subsequent crawls, so cold-starts only affect the first crawl per hour per slug. Acceptable for v0.1.

**(vi) `regulatory/page.tsx` has `export const dynamic = 'force-dynamic'`.**
Adding `export const metadata` to this file does not conflict with `export const dynamic`. Both are valid named exports in Next.js 16. Ensure they are not accidentally merged into a single export statement.

**(vii) `robots` on staging/tailnet URLs.**
If the Tailscale-only staging URL (if any) is indexed, add `export const metadata: Metadata = { robots: { index: false } }` in a staging-specific layout or use middleware to inject `X-Robots-Tag: noindex` for non-production `HOST` headers. Out of scope for T26 implementation unless Andy specifies a staging URL — document as a follow-up in the PR description.

**(viii) `og:image` on auth-gated pages rendered without session.**
Social crawlers do not hold session cookies. `/alerts` and `/projects` are middleware-gated in v0.1. The middleware (`proxy.ts`) redirects unauthenticated requests. OG tags on the redirect target (sign-in page or landing) will be seen by crawlers instead. This is acceptable — the redirect behaviour is owned by T05 and is not changed by T26. The `export const metadata` in these files is still correct for authenticated users who share links and for the HTML source inspected by debuggers.

---

## 8. Definition of done

- [ ] All acceptance criteria (AC-1 through AC-9) pass.
- [ ] `public/og-image.png` present and served at `/og-image.png` with `Content-Type: image/png`.
- [ ] `app/layout.tsx` exports the fully-populated `metadata` object (title template, OG, Twitter, `metadataBase`).
- [ ] All five per-page files export `export const metadata` with correct title and description.
- [ ] `app/(app)/projects/[slug]/opengraph-image.tsx` created; `runtime = 'edge'`, `revalidate = 3600`, `size = { width: 1200, height: 630 }`.
- [ ] `app/(app)/projects/[slug]/page.tsx` exports `generateMetadata` without modifying the render body.
- [ ] `npm run build` exits 0.
- [ ] `npx tsc --noEmit` exits 0 with no new type errors.
- [ ] Manual AC-7 (opengraph.xyz) and AC-8 (Slack/WhatsApp) verified by Andy and documented in the PR description.
- [ ] Story's files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] `TASKS.md` status flipped `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

---

## 9. Open questions

1. **`next/og` font embedding** — IBM Plex Sans is not embeddable from Google Fonts in the Edge runtime without a pre-downloaded font subset. Is the system-font fallback acceptable for the OG image in v0.1, or should the implementer embed a WOFF2/TTF subset of IBM Plex Sans (adds ~30 KB to the Edge Function bundle)? Recommend: accept system font for v0.1; revisit in v0.2 if brand consistency is a concern.

2. **`metadataBase` for preview deploys** — Should `NEXT_PUBLIC_SITE_URL` be added to `.env.example` now so Netlify preview deploys can set it to their own URL, or is hardcoding `https://karbonlens.com` acceptable for v0.1? Recommend: hardcode for v0.1; add env var in v0.2.

3. **Dynamic OG vs. static pre-render** — `ImageResponse` at the Edge adds per-slug cold-start latency. An alternative is to pre-generate OG PNGs for all 64 projects at build time via a `generateStaticParams` + `generateImageMetadata` approach. For 64 projects at v0.1 scale, the static approach is viable but requires a DB-connected build step. Is the dynamic approach (specified here) the correct tradeoff? Recommend: yes — dynamic is cleaner, avoids build-time DB dependency, and cold-start latency is invisible once CDN-cached.

4. **`og:image` for `/methodology`** — T24 has not yet shipped. Should T26 add a placeholder `export const metadata` to the T24 page stub now, or wait? Recommend: wait; document in PR description.

---

## 10. References

- Next.js 16 Metadata API: https://nextjs.org/docs/app/api-reference/functions/generate-metadata
- Next.js 16 `opengraph-image.tsx` file convention: https://nextjs.org/docs/app/api-reference/file-conventions/metadata/opengraph-image
- `ImageResponse` / `next/og`: https://nextjs.org/docs/app/api-reference/functions/image-response
- Legacy prototype OG tags: `legacy/prototype/index.html` lines 9–30
- Legacy OG image: `legacy/prototype/og-image.png` (1200×630, 493 KB)
- Design tokens: `app/globals.css` (light-mode palette — `#fafaf7` bg, `#0f6e56` success, `#854f0b` warning, `#a32d2d` danger, `#888780` neutral)
- OG image dark background from legacy theme-color: `#0F1411`
- Open Graph validator: https://www.opengraph.xyz
- Twitter Card validator: https://cards-dev.twitter.com/validator
