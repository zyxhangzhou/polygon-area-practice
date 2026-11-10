---
name: change-plan
description: Versioned change plan for a requirement too big for one change — split it into changes and keep the plan's lineage (v1 → v2 …) in a plans folder. Use when drafting a change breakdown for a new requirement; when a discovery, an overturned premise, or an inserted problem reshapes the plan; when a planned change ships or is archived; when resuming a track that has a plan folder. 需求拆分成多个 change 的版本化计划：起草拆分、计划变更出新版本、change 交付后打勾、新 session 接续时读最新版。
argument-hint: "[feature-slug] [language: en|zh|…]"
---

# Change plan

A requirement too big for one change gets a **plan**: a folder of versioned Markdown files naming the changes, their order, and why. A **change** is one independently shippable unit of work — typically one branch and one PR, or one OpenSpec change if the project uses OpenSpec. The plan is the track's single source of truth between sessions. Each change's own spec or ticket still owns its detailed scope; the plan owns only the breakdown and sequence.

Settings live in [`config.md`](config.md): the plans root and the default language. Read it first on every branch.

Invocation arguments: `$ARGUMENTS` — an optional feature slug and/or a language code; either may be absent.

## The four branches

Pick one by what just happened:

| Branch | When | Writes |
|---|---|---|
| **Draft** | New requirement, analysis done, breakdown not yet written | `README.md` + `<slug>-v1.md` |
| **Revise** | The breakdown itself changes (see *Bump or tick*) | new `<slug>-vN+1.md`, banner on vN, README |
| **Tick** | A change's status moves: work started, PR opened, merged, archived | latest version, in place |
| **Resume** | A new session picks up a track that has a plan folder | nothing |

### Draft

1. Analyse the requirement against the code and existing docs. Propose the breakdown in chat: each change's goal, rough scope, dependencies, order. Take the slug from the arguments; otherwise propose a kebab-case slug alongside the breakdown.
2. On the user's go-ahead, write `README.md` and `<slug>-v1.md` from [`template.md`](template.md), status `draft`. The first time the plans root is created in a repository, check whether git ignores it (`git check-ignore <plans_root>`); if it does not, tell the user and offer to add it to `.gitignore` or `.git/info/exclude`. Plans are working notes between one person and the agent, not reviewed artifacts.
3. Iterate with the user. While status is `draft`, edit v1 in place — nothing is frozen yet.
4. When the user confirms the split, set status `confirmed`.

Done when every item the user asked for maps to a change or sits in *Out of scope* with a reason, and every change has an acceptance line.

### Revise

1. Read the README and the latest version only.
2. Copy it to `<slug>-vN+1.md`. Fill the header: `Supersedes vN`, today's date, session ID, trigger, one-line reason.
3. Apply the change to the breakdown, following *Change IDs*.
4. Fill *Changes since vN*: one row per change that was added, split, merged, dropped, reordered, or re-scoped, each with its reason.
5. Put the one-line banner at the top of vN (the only edit a frozen version ever takes). Add the new row to the README's version chain and point *Current* at vN+1.

Done when a reader holding only vN+1 can tell what changed from vN and why, without opening vN.

### Tick

Edit the latest version in place: update the change's status cell (PR number, branch, spec or ticket ref), and append one line to its *Status log* with date and session ID. Something found along the way goes under *Follow-ups*, not *Out of scope*. Tick in the same turn the event happens — a merged PR with an unticked plan is how the next session re-plans finished work.

### Resume

Read the README, then the current version. Older versions are history: open one only to answer *why* something changed. Then check the plan against reality (merged PRs, open branches, the change tracker if there is one) and tick anything that drifted before starting work.

## Bump or tick

A new version is for a change in the **breakdown**: a change added, split, merged, dropped, reordered, or re-scoped, or a premise the plan rests on overturned. Everything else — status, PR numbers, refs, typos, a clarified sentence — is a tick. One version per structural event; several edits from one discovery belong in the same version.

## Change IDs

IDs are permanent. Once a change has an ID, the ID stays with it through every version:

- First draft: `A`, `B`, `C` … in planned order.
- A new change inserted later takes the next unused letter, wherever it lands in the order. The order column carries sequence; the letter carries identity.
- A split keeps the parent and gives children dotted IDs: `A` → `A.1`, `A.2`. The parent row stays with status `split → A.1, A.2`.
- Merged, dropped, or superseded changes keep their row with a status naming the reason or the successor.

So every ID a user has ever seen still resolves in the current version. In chat, pair an ID with its title the first time it appears in a reply (`A.1 (list endpoint org scope)`): the plan file is shared memory, the conversation is not.

## Session ID

Read it from `$CLAUDE_CODE_SESSION_ID` (write `unknown` when unset). It goes in each version header and each status-log line. `claude --resume <id>` reopens that conversation, but transcripts expire, so the plan stays self-contained: record the finding itself, with the session ID as provenance.

## Language

Resolve in order: a language given when the skill is invoked → the `Language` line in the feature's `README.md` → `default_language` in `config.md`. Record the resolved language in the README at Draft so later versions match. Prose follows the language; identifiers stay English — IDs, change refs, filenames, file paths, code.
