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
| `/projects/rimba-raya-biodiversity-reserve-project` | `app/(public)/methodology/page.tsx` | `app/(app)/projects/[slug]/page.tsx` (dynamic) | yes |
| `/regulatory` | `components/site-nav.tsx` | `app/(app)/regulatory/page.tsx` | yes |

**Total distinct internal hrefs:** 5.
**Dead links remaining after T24:** 0.

## Notes

- `legacy/prototype/src/` uses exclusively hash-routed hrefs (`#/projects`, `#/prices`, etc.) and does not match the `href="/"` absolute-path grep. Per the T24 spec §7 and the spec audit's §Cross-Check, the prototype is out of scope and correctly excluded.
- `/prices` is an existing route (`app/(app)/prices/page.tsx`), but no `href="/prices"` appears in `app/` or `components/` — it is reached via the SiteNav active-route logic using `pathname`, not an anchor. Still reachable via the nav; not a dead link.
- The methodology page adds two new internal hrefs (`/projects` and `/projects/rimba-raya-biodiversity-reserve-project`). Both resolve: `/projects` via the standard projects route; `/projects/rimba-raya-biodiversity-reserve-project` via the T06 dynamic slug route, confirmed live in the DB and in `COMMUNITY_OVERRIDES` in `lib/score.ts`. The character class `[a-z0-9/-]` in the AC-4 grep pattern includes hyphens, so this slug matches the grep cleanly and is included in the inventory above.
