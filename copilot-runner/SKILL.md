---
name: copilot-runner
description: Run GitHub Copilot CLI (`copilot` or `gh copilot`) interactively, get help, or pass prompts non-interactively with `copilot -p`.
---

# copilot-runner

## Sandbox: ALWAYS bypass

Every Bash call that invokes `copilot` or `gh copilot` MUST be run with `dangerouslyDisableSandbox: true`. This CLI hits the network, writes outside sandbox-allowed paths, and connects to local sockets, so the first sandboxed attempt always fails — retrying after the failure wastes a turn. Set the bypass on the very first call.

Use this skill when the user asks to run GitHub Copilot CLI, invoke `copilot` or `gh copilot`, script Copilot CLI, or get a non-interactive result from Copilot.

## General Rules

1. Prefer local help over memory. Run `copilot --help` or `gh copilot -- --help` before relying on unfamiliar flags.
2. Run from the target repository root or pass `-C <directory>`.
3. Prefer targeted tool permissions over broad permission shortcuts.
4. Capture stdout as the result. If Copilot modifies files, inspect the diff after it exits before reporting success.

## Run It

Start interactive Copilot CLI:

```bash
copilot
```

If using GitHub CLI as the launcher:

```bash
gh copilot
```

Start interactive mode and immediately execute a prompt:

```bash
copilot -i "fix the bug in main.js"
```

Useful flags:

- `-C <directory>` changes the working directory before execution.
- `--model <model>` selects the model.
- `--agent <agent>` invokes a custom agent.
- `--plan` or `--mode plan` starts in planning mode.
- `--autopilot` or `--mode autopilot` allows autonomous continuation.
- `--continue`, `--resume[=<id>]`, and `--session-id <id>` resume sessions.
- `--allow-tool`, `--deny-tool`, `--allow-url`, and `--deny-url` control permissions.

## Get Help

```bash
copilot --help
copilot help permissions
copilot login --help
gh copilot -- --help
```

When using `gh copilot`, put `--` before Copilot flags if there is any chance `gh` will parse them.

## Non-Interactive Prompt Result

Use prompt mode. Copilot CLI requires tool permissions for programmatic use when the agent may use tools:

```bash
copilot -p "summarize this repository" --allow-all-tools
```

Prefer targeted permissions when possible:

```bash
copilot -p "summarize this week's commits" --allow-tool 'shell(git:*)'
```

Use silent mode for scripts that only need the final response:

```bash
copilot -p "explain the current diff" --allow-tool 'shell(git:*)' --silent
```

Use JSONL output for automation:

```bash
copilot -p "review the current diff" --allow-tool 'shell(git:*)' --output-format json
```

With the GitHub CLI launcher:

```bash
gh copilot -- -p "summarize this repository" --allow-all-tools --silent
```

Use broad permission shortcuts only in trusted environments:

```bash
copilot -p "fix the bug in main.js" --allow-all
copilot -p "fix the bug in main.js" --yolo
```

## Verification Sources

This skill was built from local `copilot --help` and `gh copilot -- --help` output plus the public GitHub Copilot CLI documentation.
