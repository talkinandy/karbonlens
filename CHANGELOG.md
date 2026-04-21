# Changelog

All notable changes to KarbonLens are recorded here. Entries are grouped by release and ordered newest-first.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). SemVer per `VERSION` once we ship v0.1.

---

## [Unreleased] — v0.1 integration branch (`feature/v0.1-impl`)

Entries land here as individual user stories (T01–T23) complete against acceptance criteria. See `docs/stories/` for the story specs and `docs/TASKS.md` for the sprint overview.

### Added
- **T03 Next.js 15 bootstrap** ([feature/T03-nextjs-bootstrap]) — scaffold Next.js 16 (App Router) at the repo root, Tailwind v4 CSS-first with tokens extracted from the legacy prototype, six screens ported with mock data under route groups `(public)` and `(app)`, `netlify.toml` wired for `@netlify/plugin-nextjs`, sole ownership of `.env.example` with eight keys mapped to consuming stories. Static prototype preserved at `legacy/prototype/`. Visual design parity not verified in a browser — follow-up needed at T11–T18. Route layouts keep `<html>` / `<body>` in root only.

### Changed

### Fixed

---
