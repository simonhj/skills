---
name: todotxt
description: Manage a central todo.txt file using the todo.sh CLI. Add, list, update, complete, and prioritize tasks without ever hand-editing the file.
---

# todotxt

This skill enables structured task management using the [todo.txt](https://todotxt.org/) plain-text format and the `todo.sh` command-line tool.

## The todo.txt Format

A single line in `todo.txt` represents a single task. The format is plain text, portable, and human-readable.

### Incomplete Tasks

```
(A) Call Mom +Family @phone
(B) 2024-01-15 Schedule dentist appointment @calls
Pick up dry cleaning +Errands
```

**Rules for incomplete tasks:**

1. **Priority (optional)** — If present, it ALWAYS appears first. It is an uppercase letter `A`–`Z` enclosed in parentheses followed by a space: `(A) `.
2. **Creation date (optional)** — Appears directly after priority and a space. Format is `YYYY-MM-DD`. If no priority, the date appears first.
3. **Contexts and projects (optional)** — May appear anywhere after the priority/date:
   - **Context**: preceded by a single space and `@` (e.g., `@phone`, `@work`)
   - **Project**: preceded by a single space and `+` (e.g., `+BlogPost`, `+GarageSale`)
4. **Additional metadata (optional)** — Use `key:value` pairs anywhere after priority/date, e.g., `due:2024-02-01`.

### Completed Tasks

```
x 2024-01-20 2024-01-15 Schedule dentist appointment @calls
x 2024-01-20 Pick up dry cleaning +Errands
```

**Rules for completed tasks:**

1. A completed task starts with a lowercase `x` followed by a space: `x `.
2. The completion date appears directly after the `x `.
3. If a creation date was present, it appears directly after the completion date.

## When to use

Only use this skill when the user **explicitly** asks to interact with the **central todo.txt file** (e.g., "add to my todo.txt", "what's in my todo.txt", "update my todo.txt"). Do NOT assume all todo-related requests should go to the central `todo.txt`; some projects or workspaces may have their own project-local todo files or trackers.

Specifically:
- If the user says "add a todo" or "make a note" without specifying **todo.txt**, ask them whether they want it added to the central `todo.txt` file or somewhere else.
- If the user asks about the central `todo.txt` file by name, or uses a clear `todo.sh` command, activate this skill immediately.
- If "where to add the todo" is unclear, ask the user before proceeding.

## Core Principle

**NEVER edit the todo.txt file by hand.** Only use the `todo.sh` command. This preserves line-number stability, prevents corruption of the plain-text format, and ensures the tool's internal tracking remains consistent.

## Prefer a subagent for reads

When this skill is invoked from the main session (e.g., via `/todotxt`), consider spawning a subagent (general-purpose or Explore) to run `todo.sh` and return a concise summary. This is especially worthwhile for read-heavy operations — `list`, `listall`, `listpri`, `lsp`, `listcon`, `listproj`, `report` — whose output can dump dozens of unrelated task lines into the main session and bloat context that should stay focused on the active work.

For small writes with tiny output (`add`, `do NR`, `pri NR X`, `depri NR`, `replace NR ...`), running inline in the main session is fine — the result is one or two lines.

Use judgment: a single `todo.sh ls @phone` that's expected to return a couple of lines doesn't need a subagent; a `todo.sh listall` on a long-lived list does.

## Common Commands

### Adding tasks

```bash
todo.sh add "THING I NEED TO DO +project @context"
todo.sh a "THING I NEED TO DO +project @context"
```

- Use `-t` to automatically prepend today's date: `todo.sh -t add "THING"`

### Listing tasks

```bash
todo.sh list               # List all open tasks
todo.sh ls                 # Short alias
todo.sh list @phone        # Filter by context
todo.sh list +project      # Filter by project
todo.sh listpri            # List all prioritized tasks
todo.sh lsp A-C            # List priorities A through C
todo.sh listall            # List open and completed tasks
todo.sh listcon            # List all contexts
todo.sh listproj           # List all projects
```

### Updating tasks

```bash
todo.sh replace NR "UPDATED TASK TEXT"   # Replace entire line NR
todo.sh append NR "more text"            # Append text to end
todo.sh prepend NR "more text"           # Prepend text to beginning
todo.sh pri NR A                         # Set priority to (A)
todo.sh p NR B                           # Short alias
todo.sh depri NR                         # Remove priority
todo.sh dp NR                            # Short alias
```

### Completing and deleting

```bash
todo.sh do NR              # Mark task NR as done
todo.sh del NR             # Delete task NR (will prompt for confirmation)
todo.sh -f del NR          # Force delete without confirmation
todo.sh archive            # Move all done tasks to done.txt
todo.sh deduplicate        # Remove duplicate lines
```

### Other useful actions

```bash
todo.sh report             # Append counts of open/done tasks to report.txt
todo.sh move NR dest.txt   # Move task NR to another file
todo.sh addm "task 1
task 2"                    # Add multiple tasks at once
todo.sh shorthelp          # Quick reference of all actions
```

## Instructions

1. **Always use `todo.sh`** to read or modify the todo file. Do not open the file in an editor.
2. **Only use this skill for the central `todo.txt` file.** If the user mentions "a todo" without specifying the central `todo.txt` file, ask whether they want it added to the central `todo.txt` or to a project-local todo list.
3. **Reference tasks by line number** (`NR`) as shown in `todo.sh list` output.
4. **Prefer `replace` for edits** to ensure the entire line stays valid and well-formed.
5. **Preserve the format** when replacing or appending: keep priority at the start, dates in `YYYY-MM-DD`, contexts as `@word`, and projects as `+word`.
6. **Confirm destructive actions** (`del`, `archive`, `move`) unless the user explicitly requests a force operation.
7. **Use contexts (`@`) and projects (`+`)** liberally so the list remains filterable and organized.
8. **For multiple tasks**, consider `addm` or sequential `add` commands; present the final list to the user for verification.

## Agent-Added Task Metadata

Whenever an agent (autonomous or assistant) adds a task to the central `todo.txt`, it **must** append the following three `key:value` tags at the end of the task line so the provenance is traceable:

| Tag | Value | How to determine |
|-----|-------|-----------------|
| `agent_added` | `t` | Hard-coded indicator that this task was created by an agent |
| `agent` | `<agent_name>` | Lower-case name of the tool: `opencode`, `claude`, `codex`, `cursor`, `pi`, etc. |
| `session` | `<session_id>` | UUID or identifier of the current agent session/run |

**Examples:**

```
todo.sh add "Review pull request +Work @computer agent_added:t agent:opencode session:8753cfb2-6b78-479a-858b-3df74a4bdc80"
```

### Detecting the session ID

The session ID is already in the environment when this skill is loaded. **Read the appropriate env var directly** — don't waste a turn running `env | grep`. The cleanest pattern is to expand the variable inline in the `todo.sh add` command itself, e.g.:

```bash
todo.sh add "Review pull request +Work @computer agent_added:t agent:claude session:$CLAUDE_CODE_SESSION_ID"
```

If you want to confirm the value first, a single `echo "$CLAUDE_CODE_SESSION_ID"` (or the equivalent for your agent) is enough.

| Agent | Use this env var directly | If empty/unset |
|-------|---------------------------|----------------|
| **claude** (Claude Code) | `$CLAUDE_CODE_SESSION_ID` | Check other `CLAUDE_*` vars that look like a UUID/run ID. If none, omit the `session:` tag. |
| **opencode** | `$OPENCODE_RUN_ID` | Fall back to `$OPENCODE_PID`, otherwise omit the `session:` tag. |
| **codex** (OpenAI Codex CLI) | `$CODEX_THREAD_ID` | Check other `CODEX_*` vars that look like a UUID/run ID. If none, omit the `session:` tag. |

**Last-resort fallback only:** if you genuinely don't know which agent you're running as, `env | grep -iE '(opencode|claude|codex|cursor|pi)'` can be used to discover the right variable. Don't run this as the default workflow — pick the var from the table above. If no suitable variable exists, omit `session:` but still include `agent_added:t` and `agent:<name>`.

## Configuration

The default location is `~/todo.txt`. If a custom config is used, it is typically at `~/.todo.cfg` or referenced via `todo.sh -d /path/to/config`. Respect the user's configured `TODO_DIR` and file locations.

## Example Workflow

```bash
# Add a task
todo.sh add "(A) Write blog post +Blog @computer due:2024-02-01"

# See what’s on the plate
todo.sh list

# Bump priority on line 3
todo.sh pri 3 A

# Mark line 2 done
todo.sh do 2

# Archive completed tasks
todo.sh archive

# Generate a report
todo.sh report
```
