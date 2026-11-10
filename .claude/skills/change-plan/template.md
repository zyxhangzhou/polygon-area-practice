# change-plan templates

Section headings below are in English; translate them into the plan's language. Keep the IDs, status keywords, and field names (`Supersedes`, `Session`) in English so the files stay greppable across languages.

## `<slug>/README.md`

```markdown
# <Feature title>

- Current: [<slug>-v2.md](<slug>-v2.md)
- Language: en
- Requirement: <one line — what the user asked for>

## Version chain

| Version | Date | Session | Trigger | Summary |
|---|---|---|---|---|
| v1 | 2026-09-27 | a1b2c3d4-… | initial | first breakdown: A, B, C |
| v2 | 2026-10-02 | e5f6a7b8-… | discovery | A split into A.1/A.2; D inserted before B |
```

Trigger is one of: `initial`, `discovery` (found something not explored before), `overturned` (a premise proved wrong), `inserted` (a new problem joined the track), `user` (the user changed the ask).

## `<slug>/<slug>-vN.md`

```markdown
# <Feature title> — vN

- Status: draft | confirmed
- Supersedes: vN-1        (v1: none)
- Date: YYYY-MM-DD
- Session: <$CLAUDE_CODE_SESSION_ID>
- Trigger: <trigger> — <one-line reason>

## Changes since vN-1

(v1: omit this section)

| ID | Was | Now | Why |
|---|---|---|---|
| A | one change | split → A.1, A.2 | backend half blocks on the migration; frontend half can ship now |
| D | — | new, order 2 | smoke found the list endpoint ignores org scope |

## Background

What the requirement is, and the facts about the current system the breakdown rests on. Findings that drove a revision go here, stated in full.

## Changes

| Order | ID | Change | Ref | Depends on | Status |
|---|---|---|---|---|---|
| 1 | A.1 | … | `branch-or-spec-name` | — | shipped #1234 |
| 2 | D | … | — | A.1 | planned |
| — | A | … | — | — | split → A.1, A.2 |

Ref is whatever identifies the change outside the plan: a branch, an OpenSpec change name, a ticket. Status keywords: `planned`, `in-progress`, `pr #N`, `shipped #N`, `archived`, `split → …`, `merged → X`, `dropped: <reason>`, `superseded → X`.

### A.1 — <title>

- Goal:
- Scope: in / out
- Acceptance: <the observable result that means done>
- Notes:

(one subsection per live change)

## Out of scope

Items the user raised that no change covers, each with the reason.

## Follow-ups

Things found while working that no change covers yet: pre-existing bugs, dead code, gaps in canonical specs. Each line names where it was found (change ID) and whether it was confirmed. Promoting one into the plan is a new change, so a new version.

## Open questions

`[NEEDS DECISION]` items, each naming who decides.

## Status log

- YYYY-MM-DD · <session> · A.1 merged as #1234
```

## Banner on a superseded version

First line of the frozen file:

```markdown
> Superseded by [vN+1](<slug>-vN+1.md) on YYYY-MM-DD — <one-line reason>.
```
