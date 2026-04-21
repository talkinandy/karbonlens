---
id: T03
title: Next.js 15 monorepo bootstrap + Netlify deploy
phase: 1
status: done
blocked_by: []
blocks: [T04, T11, T12, T13, T14, T15, T16, T17, T18, T22, T23]
owner: tbd
effort_estimate: 3h
---

## 1. User story

As a developer starting work on KarbonLens, I want a Next.js 15 App Router project scaffolded in the repo with the six product screens rendering mock data and a Netlify deployment wired up, so that T04 onward can wire in real data without touching the scaffold layer.

## 2. Context & rationale

The repo currently contains a static HTML prototype (`index.html`, `styles.css`, `data.js`, `src/`, `og-image.png`, `og-image.svg`, `KarbonLens.zip`). This task replaces that prototype with a Next.js 15 monorepo that becomes the permanent frontend home for all v0.1 screen work (T11–T18). The static files must be preserved — not deleted — under `legacy/prototype/` because they carry the visual design intent and serve as the reference until the design brief is available in the repo.

**Local dev is the primary target.** Netlify deployment is a secondary nice-to-have for this story. The app must run cleanly on `localhost:3000` against the local Postgres on the same VPS before any Netlify wiring is attempted.

No auth, no real data, no tests in this story. Everything downstream depends on this scaffold existing.

**Visual reference:** T03 uses `legacy/prototype/styles.css` and `legacy/prototype/index.html` as the visual reference for screen structure and design tokens. T11–T18 will refine screens once real data lands. The design brief is not required before implementation begins — see §9 OQ-1.

---

## 3. Scope

### In scope

1. **Preserve prototype.** Move `index.html`, `styles.css`, `data.js`, `src/`, `og-image.png`, `og-image.svg` to `legacy/prototype/`. Handle `KarbonLens.zip` the same way (move to `legacy/prototype/KarbonLens.zip`). Also move any original `netlify.toml` from the root if it pre-dates this story. Commit that move before scaffolding Next.js on top.

2. **Scaffold Next.js 15.** Run the following from the repo root after the prototype is moved:
   ```bash
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --turbopack --skip-git
   ```
   `--skip-git` prevents create-next-app from reinitialising git in the existing repo.

   **If the tool refuses to scaffold into a non-empty directory**, use the temp-scaffold pattern (safer and dotfile-preserving):
   ```bash
   mkdir /tmp/karbonlens-scaffold
   npx create-next-app@latest /tmp/karbonlens-scaffold --typescript --tailwind --app --no-src-dir --turbopack --skip-git
   rsync -a /tmp/karbonlens-scaffold/ ./ --exclude='.git'
   rm -rf /tmp/karbonlens-scaffold
   ```
   The `rsync` approach is preferred over `mv temp/* .` because it correctly copies dotfiles (`.gitignore`, `.eslintrc.json`, etc.) without requiring shell options.

3. **Merge `.gitignore`.** After scaffolding, `create-next-app` writes a new `.gitignore` covering Next.js artefacts. The repo's pre-existing `.gitignore` covers `.env`, `*.log`, `.vscode/`, `.idea/`. Merge both:
   ```bash
   # If using rsync approach: Next.js .gitignore is already in place.
   # Restore pre-existing rules not present in the new file:
   sort -u /tmp/karbonlens-scaffold/.gitignore <(git show HEAD:.gitignore 2>/dev/null || true) > .gitignore
   ```
   Verify `.env.local` and `node_modules/` and `.next/` are all present in the final `.gitignore` before committing.

4. **Preserve `README.md`.** `create-next-app` writes a boilerplate `README.md`. Before scaffolding (or immediately after), save the existing file:
   ```bash
   mv README.md README-legacy.md   # or cp if using rsync
   ```
   Then merge the Quickstart section into the existing content (see §3.9). The legacy README must not be silently overwritten.

5. **Install dependencies.**
   ```bash
   npm i drizzle-orm postgres next-auth@beta @auth/drizzle-adapter
   npm i -D drizzle-kit @types/node @netlify/plugin-nextjs
   ```

6. **Create folder skeleton** per `docs/architecture.md` §2:
   - `app/(public)/` — public routes group
   - `app/(app)/` — authenticated routes group
   - `app/api/` — API routes (stub only; real routes come in T04+)
   - `lib/` — shared server utilities
   - `components/ui/` — design-system primitives
   - `components/map/` — MapLibre wrappers (placeholder dir only)
   - `scrapers/` — already exists or create empty with a `.gitkeep`

### Route group boundaries

The two route groups follow this division:

| Group | Routes | Notes |
|---|---|---|
| `(public)` | `/`, `/about` | No auth required; served to all visitors |
| `(app)` | `/projects`, `/projects/[slug]`, `/prices`, `/regulatory`, `/alerts` | T05 adds auth middleware; T03 passthrough only |

`(public)/layout.tsx` is a **segment layout** — it must NOT contain `<html>` or `<body>` elements, as these are already provided by `app/layout.tsx` (the root layout). It may contain a public-facing nav shell or render `{children}` directly.

`(app)/layout.tsx` is similarly a segment layout (no `<html>`/`<body>`). For T03 it is a passthrough (`return <>{children}</>`). T05 will add `UserMenu` and `OnboardingModal` to this layout — T03 must not add anything that would conflict.

7. **Tailwind v4 tokens.** Extract all CSS custom properties from `legacy/prototype/styles.css` (colours, spacing, font sizes, etc.) and copy them verbatim into `app/globals.css` under `:root`. This is the design token source of truth until the design brief is committed.

   **Tailwind v4 note:** If `create-next-app@latest` scaffolds Tailwind v4 (CSS-first config), no `tailwind.config.ts` will be generated — design tokens go in `app/globals.css` under `@theme { ... }` blocks. If Tailwind v3 is scaffolded, `tailwind.config.ts` is generated and tokens can go in the `extend` section or kept in `:root` CSS vars. Document which version was scaffolded in a comment at the top of `globals.css`.

   Fallback: if Tailwind v4 causes issues with any dependency, downgrade during scaffolding by specifying `tailwind@3` in `package.json` and re-running install. Document this in §7 if encountered.

8. **Port six screens as Next.js pages with mock data from `lib/mock-data.ts`.** Each page must return a valid HTML shell; it does not need to look pixel-perfect at this stage — visual polish comes in T11–T18 when real data lands.

   **Mock data module:** Create `lib/mock-data.ts` exporting four named arrays:
   - `mockProjects` — 3 project records (include slugs `katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`)
   - `mockPriceSeries` — array of price points for the price chart placeholder
   - `mockRegulatoryEvents` — array of seeded regulatory timeline events
   - `mockAlerts` — empty array (alerts inbox starts empty)

   Each page file imports from `lib/mock-data.ts`. Add a `// TODO T11+: replace with db query` comment at the import site. When real data arrives in T11+, removing the mock is a single-file deletion of `lib/mock-data.ts` plus replacing the import in each page.

   **Public slug note:** The three slugs declared in `mockProjects` (`katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`) are the canonical public slugs. T05 hardcodes these exact strings in the middleware negative lookahead. Do not change them without coordinating with T05.

   | Route | File | Notes |
   |---|---|---|
   | `/` | `app/(public)/page.tsx` | Landing — hero, 3 featured project cards, stat counters (hardcoded) |
   | `/projects` | `app/(app)/projects/page.tsx` | Projects explorer — table, filters bar (static) |
   | `/projects/katingan-peatland` | `app/(app)/projects/[slug]/page.tsx` | Project detail — stat cards, score breakdown placeholder, empty issuances section |
   | `/prices` | `app/(app)/prices/page.tsx` | Price intelligence — stat cards + placeholder chart |
   | `/regulatory` | `app/(app)/regulatory/page.tsx` | Regulatory timeline — static list of the seeded events |
   | `/alerts` | `app/(app)/alerts/page.tsx` | Alerts inbox — empty state with "No notifications yet" |

   The `(app)` layout does NOT enforce auth at this stage. Auth middleware is wired in T05. For T03, `(app)/layout.tsx` is a passthrough layout.

9. **`.env.example` — T03 is the sole owner.** T03 writes the complete `.env.example` up front with every env var that any v0.1 story adds. T04, T05, T17, and T22 verify that their keys are present; they do not append or modify this file. Committed content (all values as commented placeholders):

   ```bash
   # .env.example — KarbonLens v0.1
   # Copy to .env.local and populate before running npm run dev.
   # Never commit .env.local — it is gitignored.
   #
   # Key index (story that consumes each var):
   #   DATABASE_URL         → T04 (Drizzle client)
   #   GOOGLE_CLIENT_ID     → T05 (Google OAuth)
   #   GOOGLE_CLIENT_SECRET → T05 (Google OAuth)
   #   NEXTAUTH_SECRET      → T05 (NextAuth session signing)
   #   NEXTAUTH_URL         → T05 (NextAuth redirect base)
   #   GFW_API_KEY          → T09/T13 (Global Forest Watch API)
   #   RESEND_API_KEY       → T17 (email digest)
   #   SENTRY_DSN           → T22 (error tracking)

   # ── Database ────────────────────────────────────────────────────────────────
   # For local dev: SSL not required on localhost (sslmode=disable).
   # For Netlify deploy (v0.2+): replace localhost with VPS public IP or
   #   Tailscale IP and update pg_hba.conf. See T04 for connectivity options.
   DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens?sslmode=disable

   # ── NextAuth ────────────────────────────────────────────────────────────────
   NEXTAUTH_URL=http://localhost:3000
   # generate: openssl rand -base64 32
   NEXTAUTH_SECRET=CHANGE_ME

   # ── Google OAuth ────────────────────────────────────────────────────────────
   GOOGLE_CLIENT_ID=CHANGE_ME
   GOOGLE_CLIENT_SECRET=CHANGE_ME

   # ── External APIs ───────────────────────────────────────────────────────────
   GFW_API_KEY=CHANGE_ME
   RESEND_API_KEY=CHANGE_ME

   # ── Error tracking ──────────────────────────────────────────────────────────
   SENTRY_DSN=
   ```

   `.env.local` must be in `.gitignore`. Verify with `git status` before every commit.

10. **`netlify.toml`** in repo root. The `@netlify/plugin-nextjs` plugin manages the publish directory internally — do NOT set `publish = ".next"`:
    ```toml
    [build]
      command = "npm run build"

    [[plugins]]
      package = "@netlify/plugin-nextjs"
    ```
    Netlify site ID and deploy key are configured via the Netlify dashboard — not in this file.

    **Netlify deploy target clarification:** T03 commits land on `feature/v0.1-impl` (or `feature/t03-nextjs-bootstrap`, merged to `feature/v0.1-impl`). Production deploy to `main` is handled in T23. If Andy enables branch preview deploys in the Netlify dashboard, a preview URL for `feature/v0.1-impl` may fire automatically — that is acceptable. T03 does not require it.

11. **Update `README.md`** with a Quickstart section that documents the exact commands to run the app locally on this box, including how to copy `.env.example` to `.env.local` and populate it. Merge into the existing README content rather than replacing it. The pre-scaffold README must be preserved (see §3.4).

### Out of scope (explicit non-goals)

- Real database connections (T04)
- Auth wiring (T05)
- Map component implementation (T13)
- Sentry integration (T22)
- Any Python scraper work
- Mobile-native or PWA
- Automated tests of any kind
- Visual pixel-perfection — screens need to be navigable, not polished
- Netlify production (`main`) deploy — deferred to T23

---

## 4. Acceptance criteria (Gherkin)

**AC-1: Local dev server boots**
```
Given the repo is cloned and `.env.local` is populated from `.env.example`
When `npm install && npm run dev` is run
Then the process starts without error
And `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000` returns 200
And the response body contains `<html`
```

**AC-2: All six routes return 200**
```
Given the dev server is running
When the following curl commands are run:
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/projects
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/projects/katingan-peatland
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/prices
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/regulatory
  curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/alerts
Then each returns 200
```

**AC-3: Static prototype preserved**
```
Given the scaffold is complete
When `ls legacy/prototype/` is run
Then the output includes index.html, styles.css, data.js, src/, og-image.png, og-image.svg
And none of these files exist in the repo root
```

**AC-4: Credentials config**
```
Given the scaffold is complete
When `git show HEAD:.env.example` is run
Then the output contains DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID,
     GOOGLE_CLIENT_SECRET, GFW_API_KEY, RESEND_API_KEY, SENTRY_DSN
And `cat .gitignore | grep .env.local` exits 0
And `.env.local` does not appear in `git status`
```

**AC-5: Build is typecheck-clean**
```
Given the scaffold is complete and `.env.local` exists
When `npm run build` is run
Then the process exits 0
And `.next/` is created
```

**AC-6: Netlify plugin installed**
```
Given the scaffold is complete
When `cat package.json | grep @netlify/plugin-nextjs` is run
Then the package is listed under devDependencies
And `cat netlify.toml` shows the plugin and build command
And netlify.toml does NOT contain `publish = ".next"`
```

**AC-7: README quickstart (manual verification)**
```
Given a fresh clone of the repo on the same box
When the README quickstart commands are followed verbatim
Then `npm run dev` boots and localhost:3000 returns 200
```
*Note: AC-7 is a manual human-verification step, not curl-automatable. The implementer documents "verified manually" in the PR description.*

---

## 5. Inputs and outputs

### Inputs

- Existing repo with static prototype files at root
- `docs/architecture.md` §2 (folder layout), §7 (env vars)
- `legacy/prototype/styles.css` (design tokens via CSS custom properties — visual reference)
- `legacy/prototype/index.html` (visual reference for screen layout)
- `legacy/prototype/data.js` (mock data shape reference)

### Outputs (committed files and directories)

```
legacy/prototype/           # moved prototype files
  index.html
  styles.css
  data.js
  src/
  og-image.png
  og-image.svg
  KarbonLens.zip

app/
  (public)/
    layout.tsx              # segment layout (no <html>/<body>); passthrough or public nav
    page.tsx                # landing screen, imports from lib/mock-data.ts
  (app)/
    layout.tsx              # segment layout (no <html>/<body>); passthrough, no auth gate
    projects/
      page.tsx              # projects explorer, imports from lib/mock-data.ts
      [slug]/
        page.tsx            # project detail (katingan-peatland sample), imports from lib/mock-data.ts
    prices/
      page.tsx              # price intelligence, imports from lib/mock-data.ts
    regulatory/
      page.tsx              # regulatory timeline, imports from lib/mock-data.ts
    alerts/
      page.tsx              # alerts inbox, empty state
  api/                      # directory exists; no route files in T03
  globals.css               # Tailwind base + design tokens from prototype :root (or @theme if v4)
  layout.tsx                # root layout (html, body, font)

lib/
  mock-data.ts              # mockProjects, mockPriceSeries, mockRegulatoryEvents, mockAlerts

components/
  ui/                       # directory exists; populated in T11+
  map/                      # directory exists; populated in T13

scrapers/                   # directory exists (or .gitkeep); Python work in T06+

public/                     # Next.js static assets (create-next-app generates)

.env.example                # T03-owned; all v0.1 keys present; values = CHANGE_ME or empty
.gitignore                  # merged: Next.js rules + pre-existing rules; includes .env.local
netlify.toml                # build command + @netlify/plugin-nextjs; no publish = ".next"
next.config.ts
# tailwind.config.ts        # generated by create-next-app IF Tailwind v3; absent for Tailwind v4
tsconfig.json
package.json
package-lock.json
README.md                   # merged: pre-existing content + new Quickstart section
README-legacy.md            # pre-scaffold README preserved here before create-next-app overwrites
```

**Explicitly gitignored (not committed):**
- `node_modules/`
- `.next/`
- `.env.local`

**Stub files for T04 and T05 — do NOT create these in T03.** Leave `lib/db.ts`, `lib/schema.ts`, `lib/auth.ts`, `middleware.ts`, and `app/api/auth/[...nextauth]/route.ts` absent entirely. Creating them as stubs generates dead code that will be overwritten by T04/T05 and risks type errors in `next build`.

---

## 6. Dependencies and interactions

### Upstream (what this story needs)

None — T03 is unblocked.

### Downstream (what depends on this story)

| Story | What it needs from T03 |
|---|---|
| T04 | `lib/` directory, working Next.js build; confirms `DATABASE_URL` present in `.env.example` (verify only — do not append) |
| T05 | `app/(app)/layout.tsx` passthrough to extend; confirms NextAuth keys present in `.env.example` (verify only — do not append) |
| T11–T18 | Screen page files to fill in with real data; `lib/mock-data.ts` to delete |
| T22 | Next.js project to instrument with Sentry; confirms `SENTRY_DSN` present in `.env.example` |
| T23 | Working scaffold to replace static prototype; production `main` deploy |

### File ownership

T03 owns the entire repo root layout. The paths below are locked to T03 during implementation to prevent merge conflicts with any work happening in parallel:

- `app/**` (all files)
- `components/**`
- `lib/` (directory + `lib/mock-data.ts` only — no other files)
- `legacy/**`
- `.env.example` — **T03 sole owner. T04/T05/T17/T22 verify only; no appends.**
- `.gitignore`
- `netlify.toml`
- `next.config.ts`
- `tailwind.config.ts` (if generated)
- `tsconfig.json`
- `package.json`, `package-lock.json`
- `README.md`

T01 and T02 run in parallel on the VPS and do not touch these files.

---

## 7. Edge cases and failure modes

**create-next-app refuses non-empty directory.**
Use the temp-scaffold + rsync pattern (preferred over `mv`):
```bash
mkdir /tmp/karbonlens-scaffold
npx create-next-app@latest /tmp/karbonlens-scaffold --typescript --tailwind --app --no-src-dir --turbopack --skip-git
rsync -a /tmp/karbonlens-scaffold/ ./ --exclude='.git'
rm -rf /tmp/karbonlens-scaffold
```
`rsync -a` copies dotfiles correctly. The `mv temp/* .` pattern is NOT safe — shell glob `*` silently skips dotfiles including `.gitignore`. Use rsync.

**`.gitignore` merge after scaffold.**
After rsync, the new `.gitignore` from create-next-app is in place. Restore pre-existing rules not present in the new file (`.env`, `*.log`, `.vscode/`, `.idea/`, etc.):
```bash
# Deduplicate and merge
sort -u .gitignore <(cat /path/to/saved-old-gitignore) > .gitignore.merged && mv .gitignore.merged .gitignore
```
Verify the final `.gitignore` contains at minimum: `.env.local`, `node_modules/`, `.next/`.

**Turbopack incompatibility.**
If `npm run dev` fails with a Turbopack-related error (particularly around CSS or certain node_modules), drop `--turbopack` from the dev script in `package.json`. Standard Webpack mode is the fallback and is fully stable.

**node_modules size on the VPS.**
The initial `npm install` with Next.js + drizzle-orm + next-auth will pull ~500MB into `node_modules/`. On a CX32 (4 vCPUs, 8 GB RAM, 80 GB disk) this is fine. Verify with `df -h` before starting — ensure `/` has at least 2 GB free.

**Tailwind v4 config differences.**
`create-next-app@latest` may scaffold Tailwind v4, which uses a CSS-first config (`@import "tailwindcss"` in `globals.css`) rather than `tailwind.config.ts`. If `tailwind.config.ts` is not generated, that is expected for v4 — define design tokens directly in `app/globals.css` under `@theme { }`. The §5 Outputs entry for `tailwind.config.ts` is conditional on Tailwind version. Add a comment in `globals.css` noting which version was scaffolded.

Fallback: if Tailwind v4 proves incompatible with any dependency, downgrade: remove Tailwind v4, install `tailwindcss@3 postcss autoprefixer`, run `npx tailwindcss init -p`. Document the downgrade decision in a comment.

**KarbonLens.zip contents.**
If `KarbonLens.zip` contains the same prototype HTML and assets, there is no need to unzip it — just move the zip to `legacy/prototype/KarbonLens.zip`.

**`.env.local` accidentally committed.**
Verify `.gitignore` contains `.env.local` before making any commits. Run `git status` and confirm `.env.local` is not listed before every commit in this story.

---

## 8. Definition of done

- [ ] All seven acceptance criteria pass (verified via curl and manual browser check)
- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] `legacy/prototype/` contains all prototype files including `src/`; `ls legacy/prototype/` shows them
- [ ] `.env.example` is committed with all eight keys; `.env.local` is in `.gitignore` and not tracked
- [ ] `netlify.toml` is present, `@netlify/plugin-nextjs` is in devDependencies, no `publish = ".next"` in toml
- [ ] `lib/mock-data.ts` exists and exports `mockProjects` (including slugs `katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`), `mockPriceSeries`, `mockRegulatoryEvents`, `mockAlerts`
- [ ] README Quickstart works line-for-line on a fresh clone (manual verification noted in PR)
- [ ] All changes landed in `feature/v0.1-impl` branch (via `feature/t03-nextjs-bootstrap` PR)
- [ ] CHANGELOG entry added under `[Unreleased]`: `T03 — Next.js 15 monorepo bootstrap`
- [ ] `TASKS.md` T03 status flipped to `done`
- [ ] This story's frontmatter `status` set to `done`

---

## 9. Open questions

**OQ-1 (closed): Design brief not in repo.**
~~`KarbonLens_Design_Brief.md` referenced in `docs/HANDOFF.md` but not committed.~~

**Resolution (Andy, 2026-04-19):** Proceed with `legacy/prototype/index.html` and `styles.css` as the sole visual reference for T03. Extract colour and spacing tokens from `styles.css`. T11–T18 will refine screens when real data lands. The design brief is not a prerequisite for T03 implementation. OQ-1 is closed — implementer may proceed without waiting for Andy's sign-off on this point.

**OQ-2: Netlify site already exists.**
The handoff references `karbonlens.netlify.app` as a live static site. T03 does not cut over production — that is T23. If Andy enables branch preview deploys in the Netlify dashboard, a preview URL for `feature/v0.1-impl` may fire automatically from T03's commits. The existing `karbonlens.netlify.app` (main site) is unaffected until T23 merges to `main`. The Netlify dashboard build settings should be updated to use `npm run build` (not the old static publish) before T23, but that is out of T03 scope.

**OQ-3: Branch for T03 work.**
Confirm: the scaffold commit and all associated file changes land on `feature/t03-nextjs-bootstrap` and are merged into `feature/v0.1-impl` via PR — not pushed directly to `main`.

**OQ-4: Postgres exposure for Netlify.**
T03 creates `DATABASE_URL` in `.env.example` pointing to `localhost`. T04 decides how Netlify reaches the VPS Postgres (public IP with `pg_hba.conf` restriction, Tailscale, or a proxy). The T03 implementer does not need to resolve this — the comment in `.env.example` documents the Netlify case.

**OQ-5: Public slug confirmation.**
T03 declares the three public project slugs as `katingan-peatland`, `sumatra-merang-peat`, `rimba-raya` in `lib/mock-data.ts`. T05 hardcodes these exact strings in the middleware negative lookahead. If Andy wants different slugs, confirm before T05 implementation begins. Defer to T05 implementer if not answered in time.

---

## 10. References

- `docs/architecture.md` §2 — repo layout (authoritative folder structure)
- `docs/architecture.md` §7 — environment variables (all keys for `.env.example`)
- `docs/TASKS.md` T03 — original task specification
- `docs/HANDOFF.md` — critical constraints (EN-only, no tests, Google OAuth only)
- `legacy/prototype/index.html` + `styles.css` — visual reference for screens and design tokens
- `legacy/prototype/data.js` — mock data shape reference for `lib/mock-data.ts`
- Next.js 15 App Router docs: https://nextjs.org/docs/app
- Netlify Next.js plugin: https://github.com/netlify/netlify-plugin-nextjs
