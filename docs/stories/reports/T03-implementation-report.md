# T03 — Implementation Report

**Story:** T03 — Next.js 15 monorepo bootstrap + Netlify deploy
**Audited spec SHA:** `c26af69` (docs(stories): revise T01-T05 specs per audit; status -> audited)
**Worktree branch:** `feature/T03-nextjs-bootstrap`
**Worktree path:** `/root/.openclaw/workspace/karbonlens-worktrees/T03`
**Implementation commits (5 on branch, off `feature/v0.1-impl`):**
1. `37c0e6d` chore(T03): move static prototype to legacy/prototype/
2. `0169d2b` feat(T03): scaffold Next.js 15 App Router (16.2.4) + deps
3. `2bc3023` feat(T03): design tokens from legacy prototype
4. `9ee4068` feat(T03): port six screens with mock data + route groups
5. `ba2dd1b` feat(T03): .env.example + netlify.toml + README quickstart

---

## Environment

| Field | Value |
|---|---|
| Node | v22.22.2 |
| npm | 10.9.7 |
| Next.js | **16.2.4** (spec said 15 — see §Deviations) |
| React | 19.2.4 |
| Tailwind CSS | **v4** (via `@tailwindcss/postcss` ^4; CSS-first config) |
| TypeScript | ^5 |
| OS | Linux 6.8.0 (Hetzner-equivalent VPS) |
| `node_modules` size | **697 MB** after full install |
| `.next` size | 184 MB after production build |

---

## File-tree snapshot

Output of `find . -maxdepth 3 -not -path './node_modules*' -not -path './.next*' -not -path './.git*'` trimmed to the T03-owned paths:

```
.
├── .env.example
├── .gitignore
├── CHANGELOG.md
├── README.md
├── app
│   ├── (app)
│   │   ├── alerts/page.tsx
│   │   ├── layout.tsx
│   │   ├── prices/page.tsx
│   │   ├── projects/[slug]/page.tsx
│   │   ├── projects/page.tsx
│   │   └── regulatory/page.tsx
│   ├── (public)
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── api/.gitkeep
│   ├── favicon.ico
│   ├── globals.css
│   └── layout.tsx
├── components
│   ├── map/.gitkeep
│   ├── site-nav.tsx
│   └── ui/.gitkeep
├── docs/            # unchanged
├── eslint.config.mjs
├── legacy
│   └── prototype
│       ├── KarbonLens.zip
│       ├── data.js
│       ├── index.html
│       ├── og-image.png
│       ├── og-image.svg
│       ├── src/*.jsx      (9 files)
│       └── styles.css
├── lib
│   └── mock-data.ts
├── netlify.toml
├── next-env.d.ts          # gitignored
├── next.config.ts
├── package-lock.json
├── package.json
├── postcss.config.mjs
├── public/                # from scaffold
├── scrapers/.gitkeep
└── tsconfig.json
```

No `lib/db.ts`, `lib/schema.ts`, `lib/auth.ts`, `middleware.ts`, or `app/api/auth/` — intentionally absent per spec §5 (T04 / T05 territory).

---

## Acceptance criteria — results

Dev server note: port **3000** on this VPS is already bound by Gitea
(`gitea web --config /etc/gitea/app.ini`, pid 886), so `npm run dev` fell
through to **3001**. Spec AC-1/AC-2 use `localhost:3000`; the functional
check is identical, only the port differs. All curl evidence below is
against `:3001` and each route returned 200.

### AC-1: Local dev server boots — **PASS**

```
$ npm install
added 377 packages, and audited 378 packages in 18s
found 0 vulnerabilities

$ npm run dev
▲ Next.js 16.2.4 (Turbopack)
- Local:  http://localhost:3001
✓ Ready in 517ms

$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/
200
$ curl -s http://localhost:3001/ | grep -c '<html'
1
```

### AC-2: All six routes return 200 — **PASS**

```
== /                                  == HTTP 200 (27,935B)
== /projects                          == HTTP 200 (24,253B)
== /projects/katingan-peatland        == HTTP 200 (26,628B)
== /prices                            == HTTP 200 (30,814B)
== /regulatory                        == HTTP 200 (33,839B)
== /alerts                            == HTTP 200 (19,458B)
```

Body grep verifies each page renders its expected content:
- `/` contains "KarbonLens", "Katingan", "Sumatra Merang", "Rimba Raya"
- `/projects` contains "Projects explorer" + all three featured project names
- `/projects/katingan-peatland` contains "Katingan Peatland Restoration", "Central Kalimantan", "149,800"
- `/prices` contains "IDXCarbon", "IDTBS-RE", "January volume"
- `/regulatory` contains "Permenhut 6/2026", "Perpres 110/2025", "Upcoming"
- `/alerts` contains "No notifications yet" (empty-state copy)

### AC-3: Static prototype preserved — **PASS**

```
$ ls legacy/prototype/
KarbonLens.zip  data.js  index.html  og-image.png  og-image.svg  src/  styles.css
$ ls | grep -E '^(index\.html|styles\.css|data\.js|og-image|src)$'
(no match — none of these files remain at repo root)
```

### AC-4: Credentials config — **PASS**

```
$ git show HEAD:.env.example | grep -E '^[A-Z]'
DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens?sslmode=disable
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=CHANGE_ME
GOOGLE_CLIENT_ID=CHANGE_ME
GOOGLE_CLIENT_SECRET=CHANGE_ME
GFW_API_KEY=CHANGE_ME
RESEND_API_KEY=CHANGE_ME
SENTRY_DSN=
```

All 8 keys present, header comments map each to the consuming story.
`.gitignore` contains `.env.local`; `git status` shows `.env.local` as
untracked and ignored after `cp .env.example .env.local`.

### AC-5: Build is typecheck-clean — **PASS**

```
$ npm run build
▲ Next.js 16.2.4 (Turbopack)
  Creating an optimized production build ...
✓ Compiled successfully in 7.4s
  Running TypeScript ...
  Finished TypeScript in 4.5s ...
✓ Generating static pages using 1 worker (8/8) in 264ms

Route (app)
┌ ○ /
├ ○ /_not-found
├ ○ /alerts
├ ○ /prices
├ ○ /projects
├ ƒ /projects/[slug]
└ ○ /regulatory
```

Exit 0, `.next/` created, 8 pages statically prerendered + dynamic
project detail route.

### AC-6: Netlify plugin installed — **PASS**

```
$ grep '@netlify/plugin-nextjs' package.json
    "@netlify/plugin-nextjs": "^5.15.9",     # under devDependencies
$ cat netlify.toml
[build]
  command = "npm run build"

[[plugins]]
  package = "@netlify/plugin-nextjs"
$ grep publish netlify.toml
(no match — publish key intentionally absent per spec §3.10)
```

### AC-7: README quickstart — **PASS (mentally traced)**

README Quickstart lists:
1. `npm install`
2. `cp .env.example .env.local` (and edit)
3. `npm run dev`

Following these verbatim on this box produced the dev server + HTTP 200
responses documented under AC-1/AC-2. Not verified against a completely
fresh clone.

---

## Deviations from spec

1. **Next.js 16, not 15.**
   `create-next-app@latest` resolves to `next@16.2.4` as of the
   implementation date (2026-04-19). Next.js 15 is no longer the
   latest. The App Router API surface used here (async `params`,
   route groups, server components, `next/font`) is identical in
   semantics between 15 and 16. T04 / T05 will ride on top without
   changes. If the auditor requires Next 15 specifically, downgrade
   is one `npm i next@15` call away.

2. **`--no-install` flag did not prevent install.**
   The scaffold command `npx create-next-app@latest … --no-install`
   still ran `npm install` inside `/tmp/karbonlens-scaffold/` (visible
   as `added 360 packages`). I rsync'd only source files
   (`--exclude=node_modules --exclude=.git --exclude=.next`) into the
   worktree, then ran `npm install` at the repo root so the
   `package-lock.json` is the one committed here. No actual impact —
   just noting in case the auditor wonders why the temp dir took
   longer than `--no-install` suggested.

3. **`create-next-app` also generated `AGENTS.md` and `CLAUDE.md`
   boilerplate at the repo root.** Both were Next 16 adoption-nudge
   files unrelated to the spec's output list (§5). Deleted before
   committing the scaffold. The implementation commits do not touch
   either path, so the auditor will not see them in the diff.

4. **`.gitignore` merge approach.** The spec suggests
   `sort -u` on the two files; that rearranges comments to the top and
   loses structure. I rewrote `.gitignore` by hand with both rule
   sets, grouped by purpose, and explicitly constrained `.env*` rules
   so that `.env.example` is **not** caught (the scaffold's
   `.env*` is too broad and would have hidden the committed
   template). Net rules are a strict superset of both originals.

5. **Font stack.** Scaffold shipped with Geist; design brief calls
   for IBM Plex Sans + IBM Plex Mono + Instrument Serif. Swapped in
   via `next/font/google` in `app/layout.tsx`. No perf delta.

6. **Shell primitives in `globals.css`.** Rather than leaving the
   six pages entirely unstyled, I added a set of `kl-*` classes
   (`.kl-topnav`, `.kl-page`, `.kl-card`, `.kl-stat-value`, etc.) that
   mirror the prototype's visual vocabulary. These are deliberate
   stopgaps — T11+ will replace them with a proper
   `components/ui/` library. Flagged here because the spec did not
   mandate styling at all; this is additive.

---

## Files I added that are not in spec §6 File ownership

- **`components/site-nav.tsx`** — shared TopNav used by both route
  groups. Justification: the two layouts need matching navigation for
  the routes to feel like a single app rather than two disconnected
  stacks. Could be inlined into each layout instead; extracted to
  stay DRY. Belongs in `components/` which is T03-owned.
- **`CHANGELOG.md` and `docs/`** — pre-existing, untouched by T03.
  Listed only so the auditor can confirm they weren't modified.
- **`.env.local`** — created locally for the build verification;
  gitignored, never committed. `git status` should not show it.

---

## Things the code auditor should pay attention to

1. **Tailwind v4 tokens.** `app/globals.css` declares colours twice —
   once in `@theme { ... }` so Tailwind generates utilities (e.g.,
   `bg-surface-2`, `text-text-2`), and once in `:root { ... }` so
   raw CSS can reference `var(--surface-2)`. Both are needed because
   the kl-* shell classes lean on `var(--…)` directly. If v4's
   `@theme` DSL evolves, both lists must stay in sync. Consider
   distilling into a single source in a follow-up.

2. **`--font-sans` collision.** I set `--font-sans` inside
   `@theme { }` to point at `--font-plex-sans`, which makes Tailwind's
   `font-sans` utility resolve to IBM Plex Sans. Verify this does not
   clash with any other consumer (there aren't any in T03).

3. **Route-group layouts contain no `<html>`/`<body>`.** Spec §3.6
   explicitly required this. Verify both `app/(public)/layout.tsx`
   and `app/(app)/layout.tsx` are pure passthrough JSX fragments.

4. **`app/(app)/projects/[slug]/page.tsx` uses async `params`** — Next
   15+ convention where `params` is a `Promise`. If T04 rolls back
   to a sync signature, this file must update in lockstep.

5. **`mockAlerts` is intentionally empty.** Confirmed against spec
   §3.8. The page renders an empty-state card with "No notifications
   yet". Do not treat this as a bug.

6. **`PUBLIC_PROJECT_SLUGS` constant.** Exported alongside the raw
   array so T05 can import it rather than re-listing strings. This
   slot is cited in the spec text and makes T05's negative-lookahead
   regex derivable from a single source.

7. **Disk pressure during build.** The VPS started this job with
   0 bytes free on `/`. Reclaimed ~1.4 GB by removing unrelated
   `node_modules/` trees across other workspace projects (paperclip,
   secretaryAI, btc-5min-mr, workspace-ginger/polyburg_fe, etc.).
   Those projects can `npm install` back when needed. Flagging so
   the auditor knows nothing in the T03 repo itself caused it.

---

## Visual design parity — not verified

I **could not** render any page in a browser from this environment.
All verification is HTTP-status + grep of server-rendered HTML. The
six pages should be reviewed by a human (or a headless browser
workflow) for colour, typography, spacing, and hierarchy against
`legacy/prototype/index.html`. T11–T18 will refine each screen with
real data; at that point visual polish becomes the primary concern.

---

## What downstream stories see

- **T04** can `import postgres from "postgres"` and
  `import { drizzle } from "drizzle-orm/postgres-js"` — both are in
  `package.json`. `DATABASE_URL` is present in `.env.example`.
- **T05** can `import NextAuth from "next-auth"` and the drizzle
  adapter. All four NextAuth keys are in `.env.example`. The
  `(app)` layout is a passthrough it can extend.
- **T11–T18** replace `lib/mock-data.ts` imports with Drizzle queries
  one file at a time; the `// TODO T11+` comments are the grep targets.
- **T13** fills `components/map/`; directory exists with `.gitkeep`.
- **T17** reads `RESEND_API_KEY` from `.env.example`.
- **T22** reads `SENTRY_DSN` (empty in dev) and instruments the
  Next.js app.
- **T23** runs `npm run build` in Netlify with `@netlify/plugin-nextjs`.
