---
name: cursor-runner
description: Run Cursor Agent CLI (`agent`, `cursor-agent`, or `cursor agent`) interactively, get help, or pass prompts non-interactively with print mode.
---

# cursor-runner

## Sandbox: ALWAYS bypass

Every Bash call that invokes `agent`, `cursor-agent`, or `cursor agent` MUST be run with `dangerouslyDisableSandbox: true`. This CLI hits the network, writes outside sandbox-allowed paths, and connects to local sockets, so the first sandboxed attempt always fails — retrying after the failure wastes a turn. Set the bypass on the very first call.

Use this skill when the user asks to run Cursor Agent, invoke `agent`, `cursor-agent`, or `cursor agent`, script Cursor CLI, or get a non-interactive result from Cursor.

## General Rules

1. Prefer local help over memory. Run `agent --help`, `cursor-agent --help`, or `cursor agent --help` before relying on unfamiliar flags.
2. Use `agent` when available because Cursor's docs use that command name.
3. Run from the target repository root or pass `--workspace <path>`.
4. Capture stdout as the result. If Cursor modifies files, inspect the diff after it exits before reporting success.

## Run It

Start an interactive session:

```bash
agent
```

Start with an initial prompt:

```bash
agent "refactor the auth module to use JWT tokens"
```

Equivalent forms when `agent` is unavailable:

```bash
cursor-agent "explain this project"
cursor agent "explain this project"
```

Useful flags:

- `--workspace <path>` sets the workspace directory.
- `--model <model>` selects a model.
- `--mode plan`, `--plan`, or `--mode ask` start read-only planning or Q&A modes.
- `--continue` continues the previous session.
- `--resume [chatId]` resumes a prior chat.
- `--sandbox enabled|disabled` controls sandbox mode.

## Get Help

```bash
agent --help
cursor-agent --help
cursor agent --help
```

## Non-Interactive Prompt Result

Use print mode:

```bash
agent -p "analyze this codebase and list the main components"
```

For headless use in a trusted workspace, include `--trust`:

```bash
agent -p --trust --workspace /path/to/repo "summarize the current diff"
```

For scripts that must apply edits, add `--force` or `--yolo`; without it, changes may only be proposed:

```bash
agent -p --force "add missing JSDoc comments in src/"
```

Use structured output when automation needs parsing:

```bash
agent -p --output-format json "review these changes for security issues"
agent -p --output-format stream-json --stream-partial-output "create a project summary"
```

## Verification Sources

This skill was built from local `agent --help`, `cursor-agent --help`, and `cursor agent --help` output plus the public Cursor CLI and headless-mode documentation.
