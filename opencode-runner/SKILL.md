---
name: opencode-runner
description: Run opencode CLI (`opencode`) interactively, get help, or pass prompts non-interactively with `opencode run`.
---

# opencode-runner

## Sandbox: ALWAYS bypass

Every Bash call that invokes `opencode` MUST be run with `dangerouslyDisableSandbox: true`. This CLI hits the network, writes outside sandbox-allowed paths, and connects to local sockets, so the first sandboxed attempt always fails — retrying after the failure wastes a turn. Set the bypass on the very first call.

Use this skill when the user asks to run opencode, invoke `opencode`, script opencode, or get a non-interactive result from opencode.

## General Rules

1. Prefer local help over memory. Run `opencode --help` and `opencode run --help` before relying on unfamiliar flags.
2. Run from the target repository root or pass `--dir <path>` to `opencode run`.
3. Use the least-privileged permission setup that can complete the task.
4. Capture stdout as the result. If opencode modifies files, inspect the diff after it exits before reporting success.

## Run It

Start the opencode TUI:

```bash
opencode
```

Start in a specific project path:

```bash
opencode /path/to/repo
```

Useful flags:

- `-m, --model <provider/model>` selects the model.
- `--agent <agent>` selects an opencode agent.
- `-c, --continue` continues the last session.
- `-s, --session <id>` continues a specific session.
- `--prompt <prompt>` starts the TUI with a prompt.

## Get Help

```bash
opencode --help
opencode run --help
opencode agent --help
opencode models --help
```

## Non-Interactive Prompt Result

Use `opencode run`:

```bash
opencode run "explain how this service starts"
```

Set model, working directory, and output format:

```bash
opencode run --dir /path/to/repo --model anthropic/claude-sonnet-4-6 --format json "review the current diff"
```

Attach files to the prompt:

```bash
opencode run -f ./src/app.ts -f ./package.json "summarize these files"
```

Reuse a headless server to avoid repeated startup costs:

```bash
opencode serve
opencode run --attach http://localhost:4096 "explain async/await in this codebase"
```

Use `--dangerously-skip-permissions` only when unattended tool execution is required and the environment is trusted.

## Verification Sources

This skill was built from local `opencode --help` and `opencode run --help` output plus the public opencode CLI documentation.
