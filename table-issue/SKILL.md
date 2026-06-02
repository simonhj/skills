---
name: table-issue
description: >
  Formally capture an issue: persist full context to a dated file in ~/ai-plans/,
  create a todo.txt entry that references the plan file, and return the
  reference so the issue is traceable and resumable. Codifies the
  cargo-version-contamination workflow.
---

# table-issue

Capture an issue formally: write the full context to a file under `~/ai-plans/`,
file a reference todo, and give the user a permalink they can resume from later.

## When to use

- The user describes a bug, incident, regression, or investigation that needs to
  be **parked and resumed** later.
- The user says something like "table this", "file this issue", "capture this
  for later", or describes a problem that isn't being fixed right now.
- You are mid-session and the user wants to **stop and hand off** an issue
  without losing the accumulated context.

Do **not** use for work that is being completed in the current session — this
skill is specifically for *parking* issues.

## Arguments

```
/table-issue <title> [options]
```

**`<title>`** — Short kebab-case title for the issue, used in the filename.
If omitted, derive one from the first sentence of the issue description.

**Options:**
| Flag | Default | Meaning |
|---|---|---|
| `--description <text>` | required (or taken from session context) | Full issue description, findings, reproduction steps, logs, links. |
| `--project <tag>` | inferred from current repo or `@misc` | Project tag for the todo (`+project`). |
| `--context <tag>` | inferred from issue type or `@investigation` | Context tag for the todo (`@context`). |
| `--priority [A-Z]` | none | Optional todo priority, e.g. `--priority A`. |
| `--due YYYY-MM-DD` | none | Optional due date, added as `due:YYYY-MM-DD`. |
| `--plan-dir <path>` | `~/ai-plans/` | Directory to write the plan file. |
| `--todo-file <path>` | `~/todo.txt` | Central todo.txt to append to. |
| `--edit` | off | After writing, open the plan file for the user to edit before filing the todo. |

## Workflow

### Step 1 — Gather context

1. **Title** — from argument or derive from description. Convert to kebab-case.
2. **Date stamp** — today's date in `YYYY-MM-DD`.
3. **Description** — the user may provide it inline; if not, summarize the issue
   from the current session context. Be **comprehensive**: include reproduction
   steps, error messages, relevant file paths, commit SHAs, links, hypotheses,
   and any partial findings. The goal is that a future session can pick this up
   cold.
4. **Project & context tags** — if the user doesn't specify, infer from the
   working repo name (e.g. `+socket-cli`) and the issue category (e.g.
   `@bug`, `@investigation`, `@incident`).

### Step 2 — Persist to ~/ai-plans/

Create a file at `<plan-dir>/<YYYY-MM-DD>-<title>.md` with this structure:

```markdown
# <Title>

**Filed:** <YYYY-MM-DD>
**Status:** open
**Project:** +<project>
**Context:** @<context>

## Description

<Full description from Step 1>

## Session Context

- Working directory: `<cwd>`
- Git branch: `<branch>`
- Git commit: `<sha>` (if clean)
- Git status: `<short status>` (if dirty)
- Agent: `<agent_name>`
- Session: `<session_id>`

## Related

- todo.txt ref: `todo <NR>` (filled after Step 3)

## Notes

<Any follow-up thoughts, hypotheses, or next steps>
```

Write the file. If `--edit`, open it in the editor and wait for the user to
close it before continuing.

### Step 3 — File the todo

Add a todo to the central `todo.txt` via `todo.sh add`:

```bash
todo.sh add "(A) Investigate <shortened title> +<project> @<context> plan:~/ai-plans/<YYYY-MM-DD>-<title>.md"
```

- Use the priority from `--priority` if given.
- Prepend today's date with `todo.sh -t add "..."` if no priority is given.
- Append the **three agent metadata tags** per the todotxt skill:
  `agent_added:t agent:<agent> session:<session_id>`.
- If `--due` is set, append `due:<date>`.

The `plan:` key is a custom metadata field that links the todo line directly to
the persisted plan file.

### Step 4 — Report

Return a concise summary:

```
✅ Issue tabled.

Plan:   ~/ai-plans/<YYYY-MM-DD>-<title>.md
Todo:   line <NR> in todo.txt
Title:  <Title>
Tags:   +<project> @<context>
```

If the user wants to resume the issue later, they can open the plan file or
run `todo.sh list +<project>` to find the reference.

## Resuming a tabled issue

When the user later says "work on the tabled issue about X" or references a
plan file:

1. Read the plan file.
2. Present its contents briefly: "Resuming `<title>` — filed `<date>`, status
   `<status>`, project `+<project>` @ `<context>`".
3. Ask whether to update the todo priority, mark it done, or append new findings
   to the plan file.

## Notes

- The plan file lives in `~/ai-plans/`, which is a git repo. After writing, commit
  it per the user's plan-doc rules (stage only the touched file).
- If `~/ai-plans/` does not exist, create it as a git repo (`git init`) and warn
  the user.
- Keep the todo line short; the full context is in the plan file. The todo is a
  pointer, not a dump.
