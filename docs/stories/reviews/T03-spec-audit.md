---
audit_of: T03
auditor: adversarial-spec-auditor
date: 2026-04-19
verdict: CONDITIONAL PASS — 3 blockers, 6 warnings, 4 nitpicks
---

# T03 Spec Audit — Next.js 15 bootstrap + Netlify deploy

## Verdict

**CONDITIONAL PASS.** The spec is well-structured and handles most edge cases explicitly. Three blockers must be resolved before implementation begins. No showstopper that makes the story unimplementable, but two of the blockers (the `.env.example` ownership conflict and the mock-data-strategy underspec) will create merge pain with T04/T05 if left unresolved.

---

## Blockers (must fix before implementation)

### B-1: `.env.example` multi-owner conflict (cross-story)

T03 commits `.env.example` with `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` already populated (§3.7, Scope). T05 §3.7 then says it will **append** those exact same four keys. If T03 already writes them, T05's append produces duplicates. Either:

- T03 owns the full file (all keys, all placeholders) and T04/T05 are explicitly told "confirm key present, do not re-append if already there", or
- T03 writes only `DATABASE_URL`, `GFW_API_KEY`, `RESEND_API_KEY`, `SCRAPER_*`, `DIGEST_CRON_SECRET`, and `ENABLE_*`; T04 owns `DATABASE_URL` (confirmed); T05 owns the four NextAuth/Google keys.

The current spec takes the first approach in §3 prose but does not update T04 or T05 to match. T04 §3.5 says "Append only — do not remove keys added by T03" without acknowledging T03 already writes `DATABASE_URL`. T05 §3.7 duplicates four keys T03 already writes. The ownership table must be made unambiguous across all three stories.

### B-2: `create-next-app` non-empty directory — temp-move sequence is fragile

The fallback sequence in §7 moves `docs`, `legacy`, `PRD.md`, `TASKS.md`, `CHANGELOG.md`, and `.gitignore` to `/tmp/karbonlens-hold/` but uses `mv /tmp/karbonlens-hold/* .` to restore. Shell glob expansion of `*` silently skips dotfiles (including `.gitignore`), so `.gitignore` will not be moved back. The restore command must be `mv /tmp/karbonlens-hold/* /tmp/karbonlens-hold/.??* . 2>/dev/null || true` or, preferably, use `rsync -a /tmp/karbonlens-hold/ .`. Additionally, after `create-next-app` runs, it generates a new `.gitignore` — if the original `.gitignore` is not restored before the next git operation, the repo's existing gitignore rules (`.env`, `.env.local`, `*.log`) may be silently lost. The spec must prescribe a merge step (e.g., `cat .gitignore >> /tmp/karbonlens-hold/.gitignore && mv /tmp/karbonlens-hold/.gitignore .` or use `sort -u`).

### B-3: OQ-1 fallback is underspecified as a blocker mitigation

OQ-1 flags the missing design brief as "blocking" but §3 Scope says T03 should proceed using `legacy/prototype/styles.css` as the token source. The contradiction (flagged as a blocker, but spec tells implementer to proceed anyway) means the implementer has no gate to pause. The spec must either: (a) formally downgrade OQ-1 from "blocking" to "advisory" and commit to the fallback, or (b) add an explicit AC-0: "Andy has confirmed the prototype-as-reference fallback before implementation begins." As written, an implementer could reasonably argue they must wait for Andy's explicit sign-off, or equally reasonably just proceed — ambiguity is the risk.

---

## Warnings (should fix)

### W-1: Mock data strategy is underspecified and creates T11–T18 rip-out debt

§3.6 says: "Mock data is defined in the page file itself (exported `const` or inline). Do not create a shared mock-data module." This is a reasonable constraint, but it creates a subtle rip-out problem: when T11–T18 swap in real Drizzle queries, they must touch every page file. The spec should clarify whether the mock `const` should be co-located at the top of each page file with a clear `// TODO T11: replace with db query` comment, so the rip-out surface is explicit and self-documenting. Without this, implementers vary their approach and T11–T18 have uneven starting points.

### W-2: Tailwind v4 `tailwind.config.ts` output item is speculative

The §5 Outputs section lists `tailwind.config.ts` as a committed file. But §7 edge cases correctly notes that Tailwind v4 (likely with `create-next-app@latest`) does not generate `tailwind.config.ts` — it uses `@theme` blocks in `globals.css` instead. The Outputs list must not assert `tailwind.config.ts` will exist; it should be conditional: "if Tailwind v4 is scaffolded, this file will not be generated; design tokens live in `globals.css` under `@theme`." The outputs section should be authoritative, not aspirational.

### W-3: `.gitignore` merge after `create-next-app` is not prescribed

`create-next-app` writes a new `.gitignore` covering Next.js artifacts. The existing `.gitignore` in this repo covers `.env`, `*.log`, `.vscode/`, `.idea/`, `.claude/`. The spec's fallback in §7 describes moving `.gitignore` to temp, but does not describe merging the two `.gitignore` files after scaffold. If the implementer restores the old file verbatim they lose Next.js entries; if they keep create-next-app's new one they lose the existing rules. A deduplicated merge is required — the spec must say so explicitly.

### W-4: Route-group `(public)` layout file is listed but not described

§5 Outputs lists `app/(public)/layout.tsx` as a committed file. The spec says nothing about its content. For the landing page to render without the `(app)` nav shell, `(public)` must have its own root layout or explicitly inherit from the root `app/layout.tsx`. If both `app/layout.tsx` and `app/(public)/layout.tsx` define `<html>` and `<body>`, the nesting will produce malformed HTML. The spec must clarify that `(public)/layout.tsx` is a **segment** layout (no `<html>`/`<body>`) or explain how the two layout files compose.

### W-5: AC-7 (README quickstart) is not curl-verifiable

AC-7 says "when the README quickstart commands are followed verbatim, `npm run dev` boots and localhost:3000 returns 200." This is not machine-testable — it requires a human to clone the repo, read the README, and follow the steps. All other ACs are curl/shell commands. Either tighten AC-7 to a shell script that validates the quickstart steps execute cleanly, or explicitly mark it as a manual-human-verification AC.

### W-6: Netlify `publish = ".next"` is incorrect for the `@netlify/plugin-nextjs` plugin

The `netlify.toml` in §3.8 sets `publish = ".next"`. The Netlify Next.js plugin (`@netlify/plugin-nextjs`) manages the publish directory internally and expects `publish` to be omitted or set to the app root (`.`). Setting `publish = ".next"` causes the plugin to serve raw build artefacts rather than the processed Netlify Functions, breaking SSR. The correct `netlify.toml` for the plugin is either `publish = "."` or no `publish` key. This will cause a broken deploy if not corrected.

---

## Nitpicks (low priority)

### N-1: `scrapers/` directory ownership conflict with architecture layout

`docs/architecture.md` §2 shows `scrapers/migrations/` and `scrapers/scripts/` as subdirectories already prescribed. T03 creates `scrapers/` with a `.gitkeep`. If T06 (scraper work) assumes the directory is empty, a `.gitkeep` is fine; but if the architecture doc implies subdirectory structure, T03 should create `scrapers/common/`, `scrapers/verra/`, etc. with `.gitkeep` files — or explicitly defer all of that to T06.

### N-2: `src/` directory from prototype has no explicit entry in the move list

§3.1 lists files to move to `legacy/prototype/`: `index.html`, `styles.css`, `data.js`, `src/`, `og-image.png`, `og-image.svg`, `KarbonLens.zip`. The `src/` directory exists at root and contains all 9 JSX screen files (`Landing.jsx`, `Projects.jsx`, `ProjectDetail.jsx`, `Prices.jsx`, `Regulatory.jsx`, `Alerts.jsx`, `SatelliteMap.jsx`, `App.jsx`, `shared.jsx`). This is correctly listed in §3.1, but AC-3 only checks for `index.html`, `styles.css`, `data.js`, `og-image.png`, `og-image.svg` — it does not verify that `src/` is present in `legacy/prototype/`. AC-3 should add a `src/` check.

### N-3: `netlify.toml` conflict with existing file not addressed

The repo does not currently have a `netlify.toml` at root, so there is no collision here. However, OQ-2 references `karbonlens.netlify.app` as a live static site, which may have been deployed from a previous `netlify.toml`. The spec should note whether the Netlify dashboard site's build settings need updating when the new `netlify.toml` is pushed.

### N-4: `README.md` preservation not addressed

`create-next-app` writes a boilerplate `README.md`. The repo already has a `README.md` (2920 bytes, present at root). The temp-move sequence in §7 does not include `README.md` in the files moved to `/tmp/karbonlens-hold/`, and §3.9 only says "Update `README.md` with a Quickstart section." The implementer needs explicit instruction: move the existing `README.md` to temp before scaffold, then merge the Quickstart content from the new boilerplate into the existing file rather than replacing it.

---

## Cross-story concerns summary

| Concern | Stories affected | Risk |
|---|---|---|
| `.env.example` key duplication | T03, T04, T05 | Duplicate keys on merge → misconfiguration confusion |
| Route-group `(app)/layout.tsx` ownership | T03, T05, T11/T12 | T05 modifies `(app)/layout.tsx` to mount `UserMenu`/`OnboardingModal`; T03 creates it as a passthrough; must coordinate to avoid overwrite conflict |
| `middleware.ts` not created by T03 | T03, T05 | T03 correctly defers `middleware.ts` to T05; coherent |
| Stub files deferred correctly | T03, T04, T05 | `lib/db.ts`, `lib/schema.ts`, `lib/auth.ts`, `middleware.ts` absent from T03 — correctly deferred |
| Public slug list hardcoded in T05 middleware | T05 (informed by T03) | T05 hardcodes `katingan-peatland`, `sumatra-merang-peat`, `rimba-raya`; these slug values are established by T03's mock data — T03 must use exactly these slugs in its `[slug]` page mock, or T05's negative lookahead will be wrong |

---

## Counts

- Blockers: 3 (B-1, B-2, B-3)
- Warnings: 6 (W-1 through W-6)
- Nitpicks: 4 (N-1 through N-4)

## Top issue

**B-1 (`env.example` multi-owner conflict)** is the highest-priority fix because it will cause a merge conflict or silent duplication every time T04 or T05 runs its "append" step against a file T03 already fully populated. This is a coordination gap that compounds if all three stories run concurrently.
