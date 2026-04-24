---
id: T26
title: Social preview (OG + Twitter cards)
phase: 5-polish
status: done
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
   - **Methodology**: this page is owned by T24. **T26 is additionally blocked on T24** for this metadata entry — do not add the `/methodology` metadata until T24 has merged. If T24 has not yet merged, add a `// TODO T26: add metadata once T24 lands` comment in the T24 stub and document in the PR description. (T26's `blocked_by` lists T25 only for the overall story gate; the methodology metadata specifically requires T24 to have landed.)
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

   This file is discovered automatically by Next.js as an OG image route handler for `/projects/[slug]/opengraph-image`. `generateImageMetadata` is optional; at minimum export a default function with the correct signature.

   The implementation uses a lightweight query helper `getProjectSummary` rather than the full `getProjectDetail` to avoid pulling the complete project payload (issuances, alerts, etc.) into every OG image render. Create `lib/queries/project-summary.ts` exporting:

   ```typescript
   // lib/queries/project-summary.ts
   export interface ProjectSummary {
     name: string;
     score: number | null;
     province: string | null;
     hectares: number | null;
     statusBadge: string | null;
   }

   export async function getProjectSummary(slug: string): Promise<ProjectSummary | null>;
   ```

   Query only the hero fields required for the OG image: `nameCanonical`, `integrityScore`, `province`, `hectares`, and `statusBadge`. The full `getProjectDetail` call in `generateMetadata` (§3.4) is separate and continues to use `getProjectDetail` directly.

   ```typescript
   import { ImageResponse } from 'next/og';
   import { getProjectSummary } from '@/lib/queries/project-summary';

   // No runtime export — stays on default Node runtime.
   // lib/db.ts uses postgres-js (Node.js net.Socket) which is incompatible with
   // Vercel/Netlify Edge runtime. Next.js 16 defaults to the Node runtime when
   // no explicit runtime export is present; that is what we want here.
   // If v0.2 deploys to an edge platform, this file must be rewritten to fetch
   // project data via an HTTP API instead of importing lib/db.ts directly.
   export const revalidate = 3600; // 1-hour CDN cache

   export const size = { width: 1200, height: 630 };
   export const contentType = 'image/png';

   export default async function Image({
     params,
   }: {
     params: Promise<{ slug: string }>;
   }) {
     try {
     const { slug } = await params;
     const summary = await getProjectSummary(slug);

     // Unknown slug: return a minimal error-state ImageResponse.
     // We do NOT redirect to /og-image.png — a try/catch inside the function body
     // returning a plain ImageResponse is simpler and keeps the 1200×630 contract
     // without a network round-trip or redirect chain.
     if (!summary) {
       return new ImageResponse(
         (
           <div
             style={{
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               width: 1200,
               height: 630,
               background: '#0F1411',
               color: '#888780',
               fontSize: 32,
             }}
           >
             KarbonLens
           </div>
         ),
         { width: 1200, height: 630 },
       );
     }

     const integrityScore =
       summary.score != null ? Number(summary.score).toFixed(1) : null;

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
       summary.name.length > 60
         ? summary.name.slice(0, 57) + '…'
         : summary.name;

     const subline = [
       summary.province ?? 'Indonesia',
       summary.hectares != null
         ? `${Number(summary.hectares).toLocaleString('en-ID')} ha`
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
     } catch {
       // Render failure (DB error, Satori crash): return a minimal 1200×630 error
       // state rather than a 500. This keeps the OG image contract intact for
       // social crawlers and avoids exposing stack traces.
       return new ImageResponse(
         (
           <div
             style={{
               display: 'flex',
               alignItems: 'center',
               justifyContent: 'center',
               width: 1200,
               height: 630,
               background: '#0F1411',
               color: '#888780',
               fontSize: 32,
             }}
           >
             KarbonLens
           </div>
         ),
         { width: 1200, height: 630 },
       );
     }
   }
   ```

   Implementation notes:
   - **Runtime:** No `export const runtime` declaration. Next.js 16 defaults to the Node runtime when no explicit declaration is present — this is what we want. `lib/db.ts` uses `postgres-js`, a Node.js-only driver (`net.Socket`); it is incompatible with Vercel/Netlify Edge runtime. Stays on Node runtime; can safely import `lib/db.ts`. No edge-compat driver needed. If v0.2 deploys to an edge platform, this file must be rewritten to fetch project data via an HTTP API instead.
   - **`getProjectSummary` helper:** Place in `lib/queries/project-summary.ts`. Query only the five hero fields needed for OG image rendering (name, score, province, hectares, statusBadge). Do not reuse `getProjectDetail` — pulling the full payload (issuances, alerts) into every OG render is wasteful.
   - **Fallback for unknown slug:** Returns a minimal `new ImageResponse` with the KarbonLens wordmark on a dark background — NOT a redirect to `/og-image.png`. The try/catch wrapping the entire function body catches both the unknown-slug case (handled explicitly) and any unexpected render errors (Satori crash, DB timeout). Keeping the fallback as an `ImageResponse` maintains the 1200×630 contract for social crawlers without a network round-trip.
   - **Cold-start cost:** On the Hetzner VPS (persistent Node process), the first crawl per slug costs approximately 500ms–2s including DB query, Satori JSX render, and PNG encoding. Subsequent requests within the 1-hour CDN cache window are served from cache at near-zero cost. Social crawlers (Slack, WhatsApp, Twitter) wait up to 5s; this is within budget.
   - **Font fallback:** `fontFamily: 'IBM Plex Sans, sans-serif'` in the root style has no effect unless the font is provided in the `ImageResponse` options `fonts` array. When no `fonts` array is provided, Satori uses its bundled Noto Sans — not the OS system font and not IBM Plex Sans. The result is readable but does not match the IBM Plex Sans brand typeface. Acceptable for v0.1; see §9 OQ-1.
   - **Layout inheritance:** `opengraph-image.tsx` does NOT inherit the `(app)` route group layout wrapper. It is a bare function returning an `ImageResponse`, with no access to React context provided by the layout. This is correct behaviour — the OG image renderer should not attempt to render the app shell.
   - **Auth:** The middleware (`proxy.ts` matcher) covers `/alerts`, `/admin/*`, `/api/admin/*`. The `/projects/[slug]/opengraph-image` path inherits the `(app)` route group but is NOT auth-gated — all `/projects/[slug]/*` paths pass through middleware unauthenticated. Social crawlers reach this route without session cookies.
   - **Accessibility:** The OG image has no interactive elements; all text is rendered into the PNG by Satori. The `og:image:alt` field in `generateMetadata` (§3.4) provides the accessible description for screen readers and crawlers that parse HTML metadata. No additional accessibility work is required inside the image route itself.
   - **`revalidate = 3600`** sets the `Cache-Control: s-maxage=3600` header. On the bare-metal Hetzner VPS in v0.1 without a CDN layer, this header is emitted but has no caching effect — every request hits the Node handler. On Netlify or Cloudflare CDN in front of the server, the CDN will cache and serve stale responses for up to 1 hour. This is correct for the expected deployment path.
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
- `lib/queries/project-detail.ts` — `getProjectDetail(slug)` returns `ProjectDetail | null`; `project.nameCanonical`, `project.projectType`, `project.province`, `project.hectares`, `project.developer`, `project.totalVcusIssued`; `score.integrityScore`. Used in `generateMetadata`.
- `lib/db.ts` — Drizzle client (postgres-js). Used indirectly by both query helpers.
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
- `lib/queries/project-summary.ts` — new file; lightweight `getProjectSummary(slug)` helper (hero fields only: name, score, province, hectares, statusBadge).
- `app/(app)/projects/[slug]/opengraph-image.tsx` — new file.
- `app/(app)/projects/[slug]/page.tsx` — `generateMetadata` function added above `ProjectDetailPage`.

**Env vars:** None. `metadataBase` is hard-coded to `https://karbonlens.com`. If a staging URL is needed for preview deploys, set `NEXT_PUBLIC_SITE_URL` and use `new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://karbonlens.com')` — this is an implementation decision left to the implementer.

---

## 6. Dependencies & interactions

- **Blocked by T25** — T25 may revise the landing hero title/description. T26's landing metadata must match T25's final copy. Implementer must verify after T25 merges.
- **Blocked by T24 (partial)** — The `/methodology` metadata entry in §3.3 requires T24 to have merged. The rest of T26 can ship without T24. The story-level `blocked_by` lists T25 as the gate for the full story; T24 is a soft prerequisite for the methodology metadata entry only. Implementer must not add `app/(app)/methodology/page.tsx` metadata until T24 has landed.
- **Does not block** any current open story.
- **T12 (project detail page)** — T26 adds `generateMetadata` above the render body only. The render body is not touched. Implementer must confirm the `Props` type (already typed as `{ params: Promise<{ slug: string }>; ... }`) is compatible with `generateMetadata`'s signature.
- **File ownership (strict, to prevent merge conflicts):**
  - `public/og-image.png` — T26 owns (new file).
  - `lib/queries/project-summary.ts` — T26 owns (new file).
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
`getProjectSummary` returns `null`. The handler must not call `notFound()` (which throws a Next.js internal redirect not catchable in this route type). Instead, return a minimal `new ImageResponse` with the KarbonLens wordmark — see §3.5 implementation. This is simpler than fetching and proxying the static `/og-image.png` (no network round-trip, no circular-dependency risk), and maintains the 1200×630 PNG contract that social crawlers expect.

**(ii) Project name longer than 60 characters.**
Truncate to 57 characters and append `…` (Unicode ellipsis `…`). The JSX in `opengraph-image.tsx` does not word-wrap automatically; the 1200 px canvas at 56 px font size (Noto Sans fallback) fits approximately 25–30 characters per line. The truncation cap (60) is conservative; the implementer may adjust based on visual testing.

**(iii) Project with no integrity score.**
`score` may be `null` (project not yet scored) or `score.integrityScore` may be `null`. Both cases → display `"Score —"` in the OG image pill and omit the score from the `generateMetadata` description segment. The pill uses the neutral colour `#888780`.

**(iv) `metadataBase` mismatch in preview deployments.**
`metadataBase` is hardcoded to `https://karbonlens.com`. Netlify or other preview deploy URLs will resolve OG image relative paths against production. This is acceptable for v0.1 — preview deploys are not shared publicly. A `NEXT_PUBLIC_SITE_URL` env var can fix this in v0.2.

**(v) ImageResponse cold-start on Hetzner VPS.**
On the Hetzner VPS (persistent Node process, no cold-start), the first crawl per slug costs approximately 500ms–2s including DB query, Satori render, and PNG encoding. Social crawlers (Slack, WhatsApp, Twitter) typically wait up to 5s; this is within budget. `revalidate = 3600` ensures a CDN layer (if present) serves cached responses for 1h; without CDN, every crawl hits the Node handler directly. Acceptable for v0.1.

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
- [ ] `lib/queries/project-summary.ts` created; exports `getProjectSummary(slug: string): Promise<ProjectSummary | null>` querying only hero fields.
- [ ] `app/(app)/projects/[slug]/opengraph-image.tsx` created; no `runtime` export (defaults to Node), `revalidate = 3600`, `size = { width: 1200, height: 630 }`, try/catch fallback to minimal `ImageResponse`.
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

1. **`next/og` font embedding** — RESOLVED. System font (Satori's bundled Noto Sans) is acceptable for v0.1. No IBM Plex Sans embed. Revisit in v0.2 if brand consistency is a concern.

2. **`metadataBase` for preview deploys** — RESOLVED. Hardcode `https://karbonlens.com` for v0.1. Preview deploys are not a v0.1 concern. Add `NEXT_PUBLIC_SITE_URL` in v0.2.

3. **Dynamic OG vs. static pre-render** — RESOLVED. Dynamic per-request OG image with `revalidate = 3600` (1h CDN cache). No static pre-generation.

4. **`og:image` for `/methodology`** — RESOLVED. Wait for T24 to merge before adding `/methodology` metadata. Document in PR description if T24 has not yet landed when T26 ships.

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
