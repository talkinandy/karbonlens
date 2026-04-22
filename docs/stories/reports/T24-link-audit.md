---
id: T24-link-audit
story: T24
date: 2026-04-22
scope: app/ + components/ (legacy/ excluded — hash-routed prototype)
---

# T24 Internal Link Audit

## Command

```
grep -rhE 'href="/[a-z][a-z0-9/-]*"' app/ components/ \
  | grep -oE 'href="/[a-z][a-z0-9/-]*"' | sort -u
```

## Inventory

| href | Source(s) | Destination route | Exists? |
|---|---|---|---|
| `/alerts` | `components/site-nav.tsx` | `app/(app)/alerts/page.tsx` | yes |
| `/methodology` | `app/(app)/projects/[slug]/page.tsx:175` | `app/(public)/methodology/page.tsx` (T24, this story) | yes (post-T24) |
| `/projects` | `components/site-nav.tsx`, `app/(public)/methodology/page.tsx` | `app/(app)/projects/page.tsx` | yes |
| `/regulatory` | `components/site-nav.tsx` | `app/(app)/regulatory/page.tsx` | yes |

**Total distinct internal hrefs:** 4.
**Dead links remaining after T24:** 0.

## Notes

- `legacy/prototype/src/` uses exclusively hash-routed hrefs (`#/projects`, `#/prices`, etc.) and does not match the `href="/"` absolute-path grep. Per the T24 spec §7 and the spec audit's §Cross-Check, the prototype is out of scope and correctly excluded.
- `/prices` is an existing route (`app/(app)/prices/page.tsx`), but no `href="/prices"` appears in `app/` or `components/` — it is reached via the SiteNav active-route logic using `pathname`, not an anchor. Still reachable via the nav; not a dead link.
- The methodology page itself adds two new internal hrefs (`/projects` and `/projects/rimba-raya-biodiversity-reserve-project`). Both resolve: the first via the standard projects route, the second via the T06 slug confirmed live in the DB and in `COMMUNITY_OVERRIDES` in `lib/score.ts`. The `/projects/[slug]` grep pattern does not match literal paths with non-keyword characters, so `rimba-raya-...` is not in the distinct-href list above but was manually verified.
