# User stories — v0.1

One story per task in `docs/TASKS.md` (T01 … T23). Each story is the executable, audited specification the implementer and code auditor work against.

## File naming

`T<NN>-<kebab-slug>.md` — e.g. `T01-vps-foundation.md`, `T05-nextauth-google-oauth.md`.

## Story template

Every story file follows this structure:

```markdown
---
id: T0N
title: <short imperative>
phase: 1 | 2 | 3 | 4
status: draft | audited | in-progress | in-review | done
blocked_by: [T0X, T0Y]
blocks: [T0Z]
owner: <agent name or human>
effort_estimate: <hours>
---

## 1. User story
As a <role>, I want <capability>, so that <value>.

## 2. Context & rationale
Why this task exists. Ties back to PRD and architecture. Non-obvious constraints called out.

## 3. Scope
### In scope
- Bulleted list.
### Out of scope (explicit non-goals)
- Bulleted list.

## 4. Acceptance criteria (Gherkin)
Numbered scenarios:

**AC-1: <title>**
```
Given <precondition>
When <action>
Then <observable outcome>
```

## 5. Inputs & outputs
- **Inputs:** env vars, upstream tables, external APIs.
- **Outputs:** files created, tables written, migrations applied, env vars added to `.env.example`.

## 6. Dependencies & interactions
- Other stories this blocks / is blocked by.
- Files owned by this story (to prevent parallel-implementer conflicts).

## 7. Edge cases & failure modes
- What happens when <X>? Expected behavior documented.

## 8. Definition of done
- [ ] All acceptance criteria pass.
- [ ] Story's files landed in `feature/v0.1-impl`.
- [ ] CHANGELOG entry added under `[Unreleased]`.
- [ ] TASKS.md status flipped from `todo` → `done`.
- [ ] Story frontmatter `status` set to `done`.

## 9. Open questions
- Anything that needs Andy's call before or during implementation.

## 10. References
Links to PRD sections, architecture sections, design brief sections.
```

## Lifecycle

1. **Draft** — spec-writer agent produces the first pass.
2. **Audited** — spec-auditor agent reviews; any blocking issues are fixed by the writer. A story only advances past this gate when the auditor signs off.
3. **In-progress** — implementer agent begins work in an isolated git worktree.
4. **In-review** — code-auditor agent reviews the diff against the acceptance criteria.
5. **Done** — docs/merge agent appends a CHANGELOG entry, flips `TASKS.md` and the story frontmatter, and merges the worktree branch into `feature/v0.1-impl`.

## Conventions

- **Numbers match.** Story `T04` ↔ `TASKS.md` T04 ↔ branch `feature/t04-drizzle-schema` ↔ CHANGELOG line `T04 — Drizzle schema`.
- **File ownership is explicit.** Section 6 lists the exact paths the story is allowed to create or modify. Parallel implementers must respect this to avoid merge conflicts.
- **Acceptance criteria are testable.** Each AC should be mechanically verifiable: a shell command, a SQL query, a curl request, a visible page state. No vague adjectives.
- **Out of scope is enumerated.** If something is commonly assumed but not included, list it as explicit non-goal. Prevents scope creep in code review.
