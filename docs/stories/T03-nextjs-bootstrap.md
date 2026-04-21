---
id: T03
title: Next.js 15 monorepo bootstrap + Netlify deploy
phase: 1
status: draft
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

---

## 3. Scope

### In scope

1. **Preserve prototype.** Move `index.html`, `styles.css`, `data.js`, `src/`, `og-image.png`, `og-image.svg` to `legacy/prototype/`. Handle `KarbonLens.zip` the same way (move to `legacy/prototype/KarbonLens.zip`). Commit that move before scaffolding Next.js on top.

2. **Scaffold Next.js 15.** Run the following from the repo root after the prototype is moved:
   ```bash
   npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --turbopack --skip-git
   ```
   `--skip-git` prevents create-next-app from reinitialising git in the existing repo. If the tool still refuses to scaffold into a non-empty directory, move all remaining root files (`legacy/`, `docs/`, `PRD.md`, `TASKS.md`, `README.md`, `.gitignore`, `CHANGELOG.md`) to a temp folder, scaffold into the now-empty root, then move them back.

3. **Install dependencies.**
   ```bash
   npm i drizzle-orm postgres next-auth@beta @auth/drizzle-adapter
   npm i -D drizzle-kit @types/node
   ```

4. **Create folder skeleton** per `docs/architecture.md` §2:
   - `app/(public)/` — public routes group
   - `app/(app)/` — authenticated routes group
   - `app/api/` — API routes (stub only; real routes come in T04+)
   - `lib/` — shared server utilities
   - `components/ui/` — design-system primitives
   - `components/map/` — MapLibre wrappers (placeholder dir only)
   - `scrapers/` — already exists or create empty with a `.gitkeep`

5. **Tailwind v4 tokens.** Extract all CSS custom properties from `legacy/prototype/styles.css` (colours, spacing, font sizes, etc.) and copy them verbatim into `app/globals.css` under `:root`. This is the design token source of truth until the design brief is committed.

6. **Port six screens as Next.js pages with inline mock data.** Each page must return a valid HTML shell; it does not need to look pixel-perfect at this stage — visual polish comes in T11–T18 when real data lands.

   | Route | File | Notes |
   |---|---|---|
   | `/` | `app/(public)/page.tsx` | Landing — hero, 3 featured project cards, stat counters (hardcoded) |
   | `/projects` | `app/(app)/projects/page.tsx` | Projects explorer — table, filters bar (static) |
   | `/projects/katingan-peatland` | `app/(app)/projects/[slug]/page.tsx` | Project detail — stat cards, score breakdown placeholder, empty issuances section |
   | `/prices` | `app/(app)/prices/page.tsx` | Price intelligence — stat cards + placeholder chart |
   | `/regulatory` | `app/(app)/regulatory/page.tsx` | Regulatory timeline — static list of the seeded events |
   | `/alerts` | `app/(app)/alerts/page.tsx` | Alerts inbox — empty state with "No notifications yet" |

   Mock data is defined in the page file itself (exported `const` or inline). Do not create a shared mock-data module — that adds abstraction with no benefit at this stage.

   The `(app)` layout does NOT enforce auth at this stage. Auth middleware is wired in T05. For T03, `(app)/layout.tsx` is a passthrough layout.

7. **`.env.example` committed** with all variables from `docs/architecture.md` §7, commented with placeholder values:
   ```bash
   # Database
   DATABASE_URL=postgresql://karbonlens:CHANGE_ME@localhost:5432/karbonlens

   # NextAuth
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=CHANGE_ME

   # Google OAuth
   GOOGLE_CLIENT_ID=CHANGE_ME
   GOOGLE_CLIENT_SECRET=CHANGE_ME

   # External APIs
   GFW_API_KEY=CHANGE_ME
   RESEND_API_KEY=CHANGE_ME

   # Scraper config
   SCRAPER_USER_AGENT=KarbonLens/0.1 (+https://karbonlens.id)
   SCRAPER_LOG_DIR=/var/log/karbonlens

   # Digest cron
   DIGEST_CRON_SECRET=CHANGE_ME

   # Feature flags
   ENABLE_MAP_VIEW=true
   ENABLE_EMAIL_DIGEST=true
   ```
   `.env.local` must be in `.gitignore` (create `.env.local` locally with real values, never commit).

8. **`netlify.toml`** in repo root:
   ```toml
   [build]
     command = "npm run build"
     publish = ".next"

   [[plugins]]
     package = "@netlify/plugin-nextjs"
   ```
   Install the plugin: `npm i -D @netlify/plugin-nextjs`.
   Netlify site ID and deploy key are configured via the Netlify dashboard — not in this file.

9. **Update `README.md`** with a Quickstart section that documents the exact commands to run the app locally on this box, including how to copy `.env.example` to `.env.local` and populate it.

### Out of scope (explicit non-goals)

- Real database connections (T04)
- Auth wiring (T05)
- Map component implementation (T13)
- Sentry integration (T22)
- Any Python scraper work
- Mobile-native or PWA
- Automated tests of any kind
- Visual pixel-perfection — screens need to be navigable, not polished

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
Then the output includes index.html, styles.css, data.js, og-image.png, og-image.svg
And none of these files exist in the repo root
```

**AC-4: Credentials config**
```
Given the scaffold is complete
When `git show HEAD:.env.example` is run
Then the output contains DATABASE_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GFW_API_KEY, RESEND_API_KEY, DIGEST_CRON_SECRET
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
```

**AC-7: README quickstart is functional**
```
Given a fresh clone of the repo on the same box
When the README quickstart commands are followed verbatim
Then `npm run dev` boots and localhost:3000 returns 200
```

---

## 5. Inputs and outputs

### Inputs

- Existing repo with static prototype files at root
- `docs/architecture.md` §2 (folder layout), §7 (env vars)
- `legacy/prototype/styles.css` (design tokens via CSS custom properties)
- `legacy/prototype/index.html` (visual reference for screen layout)

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
    layout.tsx
    page.tsx                # landing screen, mock data inline
  (app)/
    layout.tsx              # passthrough, no auth gate yet
    projects/
      page.tsx              # projects explorer, mock data inline
      [slug]/
        page.tsx            # project detail, mock data inline
    prices/
      page.tsx              # price intelligence, mock data inline
    regulatory/
      page.tsx              # regulatory timeline, mock data inline
    alerts/
      page.tsx              # alerts inbox, empty state
  api/                      # directory exists; no route files in T03
  globals.css               # Tailwind base + design tokens from prototype :root
  layout.tsx                # root layout (html, body, font)

components/
  ui/                       # directory exists; populated in T11+
  map/                      # directory exists; populated in T13

lib/                        # directory exists; populated in T04+

scrapers/                   # directory exists (or .gitkeep); Python work in T06+

public/                     # Next.js static assets (create-next-app generates)

.env.example                # committed, all keys present, all values CHANGE_ME
.gitignore                  # must include .env.local, node_modules/, .next/
netlify.toml
next.config.ts
tailwind.config.ts          # generated by create-next-app
tsconfig.json
package.json
package-lock.json
README.md                   # updated with Quickstart section
```

**Explicitly gitignored (not committed):**
- `node_modules/`
- `.next/`
- `.env.local`

**Stub files for T04 and T05 — recommendation: do NOT create these in T03.** Leave `lib/db.ts`, `lib/schema.ts`, `lib/auth.ts`, `middleware.ts`, and `app/api/auth/[...nextauth]/route.ts` absent entirely. Creating them as stubs generates dead code that will be overwritten by T04/T05 and risks type errors in `next build`. The implementer of T04 creates `lib/db.ts` and `lib/schema.ts`; T05 creates `lib/auth.ts`, `middleware.ts`, and the auth API route.

---

## 6. Dependencies and interactions

### Upstream (what this story needs)

None — T03 is unblocked.

### Downstream (what depends on this story)

| Story | What it needs from T03 |
|---|---|
| T04 | `lib/` directory, working Next.js build, `.env.example` with DATABASE_URL |
| T11–T18 | Screen page files to fill in with real data |
| T22 | Next.js project to instrument with Sentry |
| T23 | Working scaffold to replace static prototype |

### File ownership

T03 owns the entire repo root layout. The paths below are locked to T03 during implementation to prevent merge conflicts with any work happening in parallel:

- `app/**` (all files)
- `components/**`
- `lib/` (directory only — no files)
- `legacy/**`
- `.env.example`
- `.gitignore`
- `netlify.toml`
- `next.config.ts`
- `tailwind.config.ts`
- `tsconfig.json`
- `package.json`, `package-lock.json`
- `README.md`

T01 and T02 run in parallel on the VPS and do not touch these files.

---

## 7. Edge cases and failure modes

**create-next-app refuses non-empty directory.**
The tool may error if the repo root is not empty even after moving prototype files. Resolution: move ALL non-Next.js files (docs, legacy, git files are ignored by the tool) out of the way temporarily, scaffold, then move them back. Exact sequence:
```bash
mkdir /tmp/karbonlens-hold
mv docs legacy PRD.md TASKS.md CHANGELOG.md .gitignore /tmp/karbonlens-hold/
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --turbopack --skip-git
mv /tmp/karbonlens-hold/* .
```

**Turbopack incompatibility.**
If `npm run dev` fails with a Turbopack-related error (particularly around CSS or certain node_modules), drop `--turbopack` from the dev script in `package.json`. Standard Webpack mode is the fallback and is fully stable.

**node_modules size on the VPS.**
The initial `npm install` with Next.js + drizzle-orm + next-auth will pull ~500MB into `node_modules/`. On a CX32 (4 vCPUs, 8 GB RAM, 80 GB disk) this is fine. If disk is tight, verify with `df -h` before starting and ensure `/` has at least 2 GB free.

**Tailwind v4 config differences.**
create-next-app may scaffold for Tailwind v4, which uses a CSS-first config (`@import "tailwindcss"` in `globals.css`) rather than `tailwind.config.ts`. If `tailwind.config.ts` is not generated, that is expected for v4 — define design tokens directly in `app/globals.css` under `@theme`. Adjust the token import step accordingly.

**KarbonLens.zip contents.**
If `KarbonLens.zip` contains the same prototype HTML and assets, there is no need to unzip it — just move the zip to `legacy/prototype/KarbonLens.zip`. The implementer should not unzip and commit redundant files.

**`.env.local` accidentally committed.**
Verify `.gitignore` contains `.env.local` before making any commits. Run `git status` and confirm `.env.local` is not listed before every commit in this story.

---

## 8. Definition of done

- [ ] All seven acceptance criteria pass (verified via curl and manual browser check)
- [ ] `npm run build` exits 0 with no TypeScript errors
- [ ] `legacy/prototype/` contains all prototype files and `ls legacy/prototype/` shows them
- [ ] `.env.example` is committed; `.env.local` is in `.gitignore` and not tracked
- [ ] `netlify.toml` is present and `@netlify/plugin-nextjs` is in `package.json` devDependencies
- [ ] README Quickstart works line-for-line on a fresh clone
- [ ] All changes landed in `feature/v0.1-impl` branch
- [ ] CHANGELOG entry added under `[Unreleased]`: `T03 — Next.js 15 monorepo bootstrap`
- [ ] `TASKS.md` T03 status flipped to `done`
- [ ] This story's frontmatter `status` set to `done`

---

## 9. Open questions

**OQ-1 (blocking): Design brief not in repo.**
`KarbonLens_Design_Brief.md` and `KarbonLens_Design_Brief_Maps_Addendum.md` are referenced in `docs/HANDOFF.md` as the visual source of truth but are not committed to the repository. T03 specifies "design matches the brief exactly" — this is unverifiable without the file.

Recommendation: use the existing `legacy/prototype/index.html`, `styles.css`, `data.js`, and `og-image.*` as the sole visual reference for T03 screen structure and token values. Extract colour and spacing tokens from `styles.css`. When the design brief is committed, T11–T18 will refine the screens against it. Alternative: Andy pastes the full design brief into the chat before T03 implementation begins.

**OQ-2: Netlify site already exists.**
The handoff references `karbonlens.netlify.app` as a live static site. Does T03 replace it immediately on merge to `main`, or should deploy to a preview URL first? Recommended: deploy to `feature/v0.1-impl` Netlify preview URL first; only cut over to the main site in T23 once real data is live.

**OQ-3: Branch for T03 work.**
Story lifecycle says implementers work in an isolated git worktree on a branch like `feature/t03-nextjs-bootstrap`. Confirm: the scaffold commit and all associated file changes land on `feature/t03-nextjs-bootstrap` and are merged into `feature/v0.1-impl` via PR — not pushed directly to `main`.

**OQ-4: Deferred architectural decision — Postgres exposure for Netlify.**
T03 creates `DATABASE_URL` in `.env.example` pointing to `localhost`. T04 decides how Netlify reaches the VPS Postgres (public IP with `pg_hba.conf` restriction, or Tailscale, or a proxy). The T03 implementer does not need to resolve this — leave `DATABASE_URL` as localhost in `.env.example` and add a comment: `# For Netlify: replace localhost with VPS public IP or Tailscale IP; see T04`.

---

## 10. References

- `docs/architecture.md` §2 — repo layout (authoritative folder structure)
- `docs/architecture.md` §7 — environment variables (all keys for `.env.example`)
- `docs/TASKS.md` T03 — original task specification
- `docs/HANDOFF.md` — critical constraints (EN-only, no tests, Google OAuth only)
- `legacy/prototype/index.html` + `styles.css` — visual reference for screens and design tokens
- `legacy/prototype/data.js` — mock data shape reference for inline mocks in pages
- Next.js 15 App Router docs: https://nextjs.org/docs/app
- Netlify Next.js plugin: https://github.com/netlify/netlify-plugin-nextjs
