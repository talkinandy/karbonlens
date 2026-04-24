---
id: T26-code-audit
story: T26
title: "Code audit — Social preview (OG + Twitter cards)"
auditor: Claude Opus 4.7 (1M context) — adversarial
date: 2026-04-22
branch: agent/T26-social-preview
commit: 115e177
base: feature/v0.1-impl @ af9d05e
worktree: /root/.openclaw/workspace/karbonlens/.claude/worktrees/agent-ad7e992f
verdict: PASS (after fix b2ef74d)
blocking: 2
non_blocking: 6
---

## Verdict

**PASS (after fix b2ef74d)** — 2 blocking fixed, 6 non-blocking remain (deferred). Original verdict: CHANGES-REQUESTED. Build/tsc are clean, project
OG image routes work end-to-end (real slug → 49 KB PNG, unknown slug →
21 KB fallback PNG, never 500). Per-project `generateMetadata` is correct and
elegantly delegates `og:image` injection to the file-convention router. The
blocking issues are **(1)** `og:image` is **absent** from all four top-level
pages that override `openGraph` (landing, /projects, /prices, /regulatory)
because Next.js replaces — not merges — the layout-level `openGraph.images`
array when a page redeclares `openGraph`. This directly violates AC-1 ("response
HTML contains … `<meta property="og:image"`"). **(2)** A spec-acknowledged
deviation was added without updating the spec: `alternateLocale: ['id_ID']` was
re-introduced in `app/layout.tsx` even though the spec §3.2 explicitly removes
it. Non-blocking findings are mostly cosmetic or forward-looking.

---

## Independent verification

### Build & types

| Command                       | Result                       |
|-------------------------------|------------------------------|
| `npx tsc --noEmit`            | exit 0, no output            |
| `npm run build` (Turbopack)   | exit 0, compiled in 27.8 s   |
| OG routes in build manifest   | `ƒ /projects/[slug]/opengraph-image-j059r5`, `ƒ /projects/[slug]/twitter-image-j059r5` |

### Static asset

```
$ md5sum legacy/prototype/og-image.png public/og-image.png
8306e14d874435c408fe3eff4393f070  legacy/prototype/og-image.png
8306e14d874435c408fe3eff4393f070  public/og-image.png
$ file public/og-image.png
public/og-image.png: PNG image data, 1200 x 630, 8-bit/color RGBA, non-interlaced
```
Byte-identical, 493 978 B, 1200×630. Matches spec.

### Live curl — OG tags (dev + prod, both confirmed identical)

**Landing (`/`)** — 7 OG/Twitter tags, **no `og:image`**:
```
<meta property="og:title" content="KarbonLens — Indonesia's carbon market, in one terminal"/>
<meta property="og:description" content="Satellite MRV, prices, reversal alerts, …"/>
<meta property="og:url" content="https://karbonlens.com"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="…"/>
<meta name="twitter:description" content="…"/>
<meta name="twitter:image" content="https://karbonlens.com/og-image.png"/>
```

**`/projects`** — 7 tags, `<title>Projects · KarbonLens</title>`, **no `og:image`**.
**`/prices`** — 7 tags, `<title>Prices · KarbonLens</title>`, **no `og:image`**.
**`/regulatory`** — 7 tags, `<title>Regulatory · KarbonLens</title>`, **no `og:image`**.

**`/projects/katingan-…`** — **17 tags**, `og:image` present and points at the
auto-hashed file-convention route:
```
<meta property="og:image" content=".../opengraph-image-j059r5?6afd949a1d2c106d"/>
<meta property="og:image:type" content="image/png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta property="og:image:alt" content="KarbonLens project summary"/>
<meta name="twitter:image" content=".../twitter-image-j059r5?…"/>
```

### Live curl — image routes

| URL                                                                           | Status | Content-Type | Size   |
|-------------------------------------------------------------------------------|--------|--------------|--------|
| `/og-image.png`                                                               | 200    | image/png    | 493 978 B |
| `/projects/katingan-peatland-…/opengraph-image-j059r5?<hash>`                 | 200    | image/png    | 49 761 B  |
| `/projects/nonexistent-slug-zzz/opengraph-image-j059r5`                       | 200    | image/png    | 21 201 B  |
| `/projects/katingan-…/twitter-image-j059r5?<hash>`                            | 200    | image/png    | (same renderer) |
| `/projects/katingan-…/opengraph-image` (unhashed, for reference)              | **404** | text/html    | —          |

All three opengraph-image responses in dev carry `cache-control: no-cache, no-store`.
In `next start` (prod), the header is `public, max-age=0, must-revalidate` — i.e.
**`revalidate = 3600` does not produce `s-maxage=3600`**; on-demand Satori render runs every
crawl. The spec already caveats this (N-6 of spec-audit) but the implementer did not
revisit. Flagged as N-3 below.

### Fallback PNG visual sanity (unknown slug)

21 201 B PNG rendered by the `fallback()` closure (centered "KARBONLENS" wordmark on
#0F1411). Never a 500. Confirmed exhaustively by the implementer (report §§Tested slugs,
Fallback behavior).

---

## Blocking issues

### B-1 — `og:image` missing on landing, /projects, /prices, /regulatory (AC-1 violation)

**Evidence:** Four `curl -sS | grep og:image` runs against dev server return zero
matches. Same behaviour in `next start` (prod). Only `twitter:image` is emitted
because no page redeclares `twitter` so the layout-level `twitter.images` leaks
through.

**Root cause:** Next.js Metadata API merges top-level fields (`title`,
`description`) from parent to child, but **replaces** nested objects like
`openGraph` wholesale. When `app/(public)/page.tsx`, `app/(app)/projects/page.tsx`,
`app/(app)/prices/page.tsx`, and `app/(app)/regulatory/page.tsx` each declare:
```typescript
openGraph: {
  url: '/',
  title: '…',
  description: '…',
},
```
they **erase** the `images: [{ url: '/og-image.png', … }]` inherited from
`app/layout.tsx`. The result is an `openGraph` object with no `images` field → no
`og:image` meta tag emitted.

**AC-1 exact text (spec §4):**
```
Then the response HTML contains all of:
  …
  <meta property="og:image"
```
Currently this fails for `/`. The most-shared URL on the site has no preview
image for LinkedIn, Facebook, Slack, WhatsApp, iMessage, or any other crawler
that parses `og:image` (which is essentially all of them).

**Fix (required):** Re-include `images` in each page-level `openGraph` override,
or drop the `openGraph` override entirely on pages that only need to add `url`
(relying on metadataBase + `alternates.canonical` instead). Minimal patch:

```typescript
// app/(public)/page.tsx, /projects, /prices, /regulatory — add to openGraph:
images: [
  {
    url: '/og-image.png',
    width: 1200,
    height: 630,
    alt: 'KarbonLens — Indonesia\'s carbon market, in one terminal',
  },
],
```

Alternative (cleaner): remove the `openGraph.title`/`openGraph.description`
override from each page (they can inherit from top-level `title`/`description`
which Next.js already mirrors into `og:title`/`og:description`), and keep only
`openGraph: { url: '/…'  }` — but even a sole `openGraph: { url }` still drops
`images`. There is no "merge" escape hatch; `images` must be re-declared.

Verify after fix: `curl -sS http://localhost:3010/ | grep 'og:image'` should
print a tag pointing at `https://karbonlens.com/og-image.png`.

---

### B-2 — `alternateLocale: ['id_ID']` re-introduced against spec §3.2

**Evidence:** `app/layout.tsx:36` contains `alternateLocale: ['id_ID'],`.

**Spec §3.2 (explicit):**
> `og:locale:alternate` (`id_ID`) from the prototype is intentionally omitted
> from the Next.js Metadata object because … there is no Indonesian localisation
> in v0.1.

Shipping `og:locale:alternate="id_ID"` to social crawlers is a **false claim**
that a Bahasa Indonesia rendering of the site exists. Facebook's crawler may
attempt to fetch an Indonesian variant via content-negotiation and the server
has no such response. LinkedIn ignores alternates; other crawlers may show a
misleading "available in Indonesian" hint.

**Fix (required):** Remove the line from `app/layout.tsx`. If the implementer
disagrees with the spec on this point (Next.js Metadata *does* in fact support
`alternateLocale` — the spec was wrong about that), the spec must be amended
in the same PR with a note. Do not silently deviate from a load-bearing copy
decision.

---

## Non-blocking issues

### N-1 — `title.default` shortened to bare "KarbonLens" (spec §3.2 deviation)

**Evidence:** `app/layout.tsx:27` has `default: 'KarbonLens'`; spec §3.2 asks
for `default: "KarbonLens — Indonesia's carbon market, in one terminal"`.

**Impact:** Pages with no `title` override fall back to the bare word. In v0.1
this matters only for `/admin/*`, auth error pages, and any future page that
forgets its own `title`. Not load-bearing today. Fix by restoring the full
tagline in `default`.

### N-2 — OG image `alt` text dropped "RADD" vs spec §3.2

**Evidence:** layout alt = `'KarbonLens satellite monitor — Katingan peatland with live deforestation alerts'`.
Spec alt = `'… with live RADD deforestation alerts'`. "RADD" (Radar for
Detecting Deforestation) is the actual GFW dataset name. The dropped word makes
the `og:image:alt` slightly less technically accurate. Restore one word.

### N-3 — `revalidate = 3600` on opengraph-image route emits no CDN cache header

**Evidence:** `curl -I http://localhost:3011/projects/…/opengraph-image-j059r5`
returns `cache-control: public, max-age=0, must-revalidate`. No `s-maxage`.
Every crawl runs Satori end-to-end.

**Root cause:** Next 16 file-convention image routes don't currently honour
`revalidate` as a `Cache-Control: s-maxage` emitter unless the route is ISR-
prerenderable (requires `generateStaticParams`). Spec-audit N-6 already flagged
this in principle; the implementer kept `revalidate = 3600` anyway. It is
harmless (no wrong output) but misleading.

**Fix (optional):** Either (a) add `generateStaticParams()` returning the top-N
most-shared project slugs (prerender them at build), or (b) emit explicit
`Response` headers via a custom route handler. Defer to v0.2; document the
behaviour in an inline comment that currently reads "1-hour CDN cache (no-op
without a CDN layer)" — amend to "`revalidate` is not honoured by Next 16 for
file-convention image routes without `generateStaticParams`; every crawl runs
Satori end-to-end."

### N-4 — `projectType` added to `ProjectSummary` without spec update

**Evidence:** `lib/queries/project-summary.ts:34` exports `projectType: string | null`.
Spec §3.5 lists five fields (`name, score, province, hectares, statusBadge`).
The implementer documented the addition in the implementation report §Deviations
(3) with a sound rationale (used by `generateMetadata` description text, saves
a second query). The OG image renderer itself does not consume it. Acceptable
but the spec should be updated to list six fields — otherwise the next reader
wonders whether the field is dead weight.

### N-5 — OG URL uses localhost host in dev only (expected, not a bug)

**Evidence:** `curl http://localhost:3010/projects/katingan-…` emits
`<meta property="og:url" content="http://localhost:3010/projects/…"/>`.
In `next start` with `NODE_ENV=production`, the same URL resolves to
`https://karbonlens.com/projects/…` because metadataBase takes precedence.

**No fix required** — this is Next.js default behaviour for relative
`openGraph.url`. Document so future investigators don't think metadataBase is
broken.

### N-6 — `/alerts` metadata added `robots: { index: false }` (enhancement not in spec)

**Evidence:** `app/(app)/alerts/page.tsx:31` sets `robots: { index: false }`.
Spec §3.3 does not require this. This is a defensive-by-default addition:
/alerts is per-user, behind middleware, and redirects unauthenticated requests;
indexing would leak a sign-in URL. Flagging as a *positive* deviation — the
implementer thought about it and added a noindex directive. Acceptable; update
spec §3.3 to canonicalise.

---

## Confirmed-correct findings

- Build clean, tsc clean, 12-file diff stays entirely within the files allowed
  by spec §6 (file ownership).
- No render-body edits to any `page.tsx`. `ProjectDetailPage` default export
  untouched; only `generateMetadata` added above it.
- `opengraph-image.tsx` has **no `export const runtime = 'edge'`** — honours
  spec B-1 fix from the spec audit. Node runtime is correct for `postgres-js`.
- `getProjectSummary` scans only public fields (`nameCanonical`, `score`,
  `province`, `hectares`, `status`, `projectType`). No PII, no admin columns.
- Unknown-slug path returns a valid `ImageResponse`, NOT a redirect (spec
  §3.5). Try/catch wraps the entire body — catches both DB-miss and Satori
  crashes. Confirmed by fabricated slug curl.
- `twitter-image.tsx` re-exports `default, size, contentType, alt` and locally
  re-declares `revalidate` — correct per Next 16's "`revalidate` can't be
  re-exported from route-segment config files" rule (documented in impl report
  deviation 2). One Satori render path, one code path — minimises cold-start
  blast radius.
- Title template `%s · KarbonLens` correctly applied to /projects, /prices,
  /regulatory, /alerts (verified via `<title>` grep). Landing page correctly
  bypasses the template by passing a full string (per Next.js Metadata docs).
- Per-project OG image renderer uses dark canvas `#0F1411`, success/warning/
  danger colour mapping mirrors `ScoreCard` thresholds (≥70 → success; ≥40 →
  warning; <40 → danger). Score pill alpha trick (`pillColor + '22'`) safe for
  6-digit hex.
- Name truncation: 60-char cap with Unicode ellipsis U+2026.
- XSS: all text goes through Satori's JSX text-node rendering; no `innerHTML`.
  HTML special chars in project names would be escaped.
- `og:image:alt` is emitted from the `alt` export in `opengraph-image.tsx` and
  appears in HTML as `<meta property="og:image:alt" content="KarbonLens project summary"/>`.
  The implementation report correctly explains why explicit `images: [{…alt}]`
  in `generateMetadata` would break the hashed URL injection.

---

## Cross-story notes

- **T24 `/methodology`:** `app/(public)/methodology/page.tsx` does not yet
  exist in this worktree. The implementer correctly skipped metadata for it
  (per spec §3.3 gating on T24). Post-T24 merge, a small follow-up is needed
  to add `export const metadata = { title: 'Methodology', description: '…',
  openGraph: { url: '/methodology', images: […] } }`. Flag as **OQ for a
  T26.1 follow-up**, not a blocker.

- **T25 landing rewrite:** T25 rewrites the `LandingPage` render body in
  `app/(public)/page.tsx`. T26 has added `export const metadata` plus
  `import type { Metadata } from 'next'` to the same file **above** the
  render body. Since T25 was audited before T26, the likely merge order is
  T25 → T26. If T25 lands first, T26's `export const metadata` block slots
  above the new render body cleanly — no semantic conflict. If T26 lands
  first, T25's rewrite must preserve the metadata export (and fix B-1's
  `images` field while touching it). Flag in T25 rebase instructions.

- **Merge order recommendation:** T25 first, T26 second (as `blocked_by:
  [T25]` declares). T24 can land at any time after T26 and will need a
  trivial metadata-addition follow-up.

---

## Merge recommendation

**Do not merge as-is.** Fix B-1 (add `images` to each overridden `openGraph`) and
B-2 (remove `alternateLocale`). Both are one-line fixes; turnaround ~15 min.
Re-run the three curl assertions afterward:
```
curl -sS http://localhost:3010/ | grep -oE 'og:image[^"]*"[^"]+"'
curl -sS http://localhost:3010/projects | grep -oE 'og:image[^"]*"[^"]+"'
curl -sS http://localhost:3010/prices | grep -oE 'og:image[^"]*"[^"]+"'
```
Each must print a tag pointing at `https://karbonlens.com/og-image.png`
(or the page's preferred image). Once green, merge after T25.

Non-blocking findings N-1 through N-6 can be folded into the same fix commit or
deferred to a T26.1 follow-up.

---

## Re-audit note

**Date:** 2026-04-22
**Fix commit:** `b2ef74d` — `fix(T26): add og:image to page overrides; drop stale alternateLocale`
**Re-auditor:** Claude Sonnet 4.6

### B-1 resolved

Re-declared `images` array in the `openGraph` block of all four affected pages:
`app/(public)/page.tsx`, `app/(app)/projects/page.tsx`, `app/(app)/prices/page.tsx`,
`app/(app)/regulatory/page.tsx`. Each page also now re-declares `twitter.images`.

Verified on dev server (port 3010):

| Page        | og:image | twitter:image |
|-------------|----------|---------------|
| `/`         | 1        | 1             |
| `/projects` | 1        | 1             |
| `/prices`   | 1        | 1             |
| `/regulatory` | 1      | 1             |

All four pages emit `og:image` pointing at `https://karbonlens.com/og-image.png`
and a matching `twitter:image`. AC-1 now satisfied.

### B-2 resolved

Removed `alternateLocale: ['id_ID']` from `app/layout.tsx`. Grep for
`alternate_locale` in dev server HTML returns empty.

### tsc + build

`npx tsc --noEmit` → exit 0 (no output). `npm run build` → exit 0.

### Non-blocking

N-1 through N-6 deferred to T26.1 follow-up per original recommendation.
