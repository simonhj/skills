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

| Agent | Known env var | Fallback if env var is missing |
|-------|--------------|--------------------------------|
| **opencode** | `OPENCODE_RUN_ID` | Use value of `OPENCODE_RUN_ID` (verified). If missing, use `OPENCODE_PID` or omit `session:` tag. |
| **claude** (Claude Code) | `CLAUDE_CODE_SESSION_ID` | Use value of `CLAUDE_CODE_SESSION_ID`. If missing, inspect `env` for any other `CLAUDE_*` variable that looks like a UUID/run ID. If none is found, omit the `session:` tag rather than invent a value. |
| **codex** (OpenAI Codex CLI) | `CODEX_THREAD_ID` | Use value of `CODEX_THREAD_ID`. If missing, inspect `env` for any other `CODEX_*` variable that looks like a UUID/run ID. If none is found, omit the `session:` tag rather than invent a value. |

**General rule:** Before adding a task, run `env | grep -iE '(opencode|claude|codex|cursor|pi)'` and pick the variable that most clearly represents the current run/session ID. If no such variable exists, omit `session:` but still include `agent_added:t` and `agent:<name>`.

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
