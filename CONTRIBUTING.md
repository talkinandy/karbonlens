# Contributing to KarbonLens

Thanks for your interest in KarbonLens — an open transparency layer for
the voluntary carbon market. Contributions of code, docs, data, and bug
reports are all welcome.

## Development setup

See [README.md](README.md) for prerequisites and local setup.

Short version:

```bash
# 1. Postgres 17 + PostGIS running locally
# 2. Copy env template and fill in secrets
cp .env.example .env.local
# 3. Apply migrations
npx drizzle-kit push
# 4. Start dev server
npm run dev
```

## Reporting bugs

Open a GitHub issue with:

- What you expected to happen.
- What actually happened.
- Steps to reproduce.
- Your environment (OS, Node version, browser if frontend).

Security issues: see [SECURITY.md](SECURITY.md). Do not file them as
public issues.

## Proposing changes

Small fixes (typos, docs, obvious bugs) — open a PR directly.

Larger changes (new features, schema migrations, API changes) — open
an issue first so we can align on scope before you invest the time.

## Pull-request checklist

Before marking a PR ready for review:

- [ ] `npm run lint` passes.
- [ ] `npx tsc --noEmit` passes (typecheck clean).
- [ ] Any new user-facing behaviour has a line in `CHANGELOG.md` under
      `## [Unreleased]`.
- [ ] Commits are signed off (see DCO below).
- [ ] PR description explains the *why*, not just the *what*.

## Developer Certificate of Origin (DCO)

All commits must carry a `Signed-off-by` line. This is a lightweight
way of declaring that you have the right to contribute the code under
the project's Apache 2.0 licence — see
[developercertificate.org](https://developercertificate.org).

Use `git commit -s` to add the sign-off automatically. Commits without
a DCO line will be asked to re-sign before merging.

Example:

```
fix(search): escape LIKE wildcards in project search

Signed-off-by: Your Name <your.email@example.com>
```

## Style

- TypeScript strict mode; no `any` unless justified in a comment.
- Prefer small, focused PRs (under ~400 changed lines) over large ones.
- Follow the existing file layout (`app/`, `components/`, `lib/`,
  `drizzle/`).
- No generated/build artefacts in commits.

## Licence

By contributing you agree that your contributions are licensed under
the Apache 2.0 licence (see [LICENSE](LICENSE)).
