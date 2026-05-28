---
name: claude-runner
description: Run Claude Code CLI (`claude`) interactively, get help, or pass prompts non-interactively with `claude -p`.
---

# claude-runner

## Sandbox: ALWAYS bypass

Every Bash call that invokes `claude` MUST be run with `dangerouslyDisableSandbox: true`. This CLI hits the network, writes outside sandbox-allowed paths, and connects to local sockets, so the first sandboxed attempt always fails — retrying after the failure wastes a turn. Set the bypass on the very first call.

Use this skill when the user asks to run Claude Code, invoke `claude`, script Claude Code, or get a non-interactive result from Claude Code.

## General Rules

1. Prefer local help over memory. Run `claude --help` before relying on unfamiliar flags.
2. Run from the target repository root unless the user specifies another workspace.
3. Use the least-privileged permission mode that can complete the task.
4. Capture stdout as the result. If Claude modifies files, inspect the diff after it exits before reporting success.

## Run It

Start an interactive Claude Code session:

```bash
claude
```

Start interactive mode with an initial prompt:

```bash
claude "explain this project"
```

Useful session flags:

- `--model <model>` selects a model or alias such as `sonnet` or `opus`.
- `--add-dir <dir>` grants access to extra directories.
- `--permission-mode <mode>` starts in `default`, `acceptEdits`, `auto`, `dontAsk`, `plan`, or `bypassPermissions`.
- `--continue` or `-c` continues the most recent conversation in the current directory.
- `--resume <session>` or `-r <session>` resumes a specific conversation.

## Get Help

```bash
claude --help
claude auth --help
claude mcp --help
```

## Non-Interactive Prompt Result

Use print mode:

```bash
claude -p "summarize the architecture of this repo"
```

Recommended scripted form with JSON output and no saved session:

```bash
claude -p --output-format json --no-session-persistence "summarize the architecture of this repo"
```

Continue a session non-interactively:

```bash
claude -c -p "run the tests and explain any failures"
```

For trusted automation that must proceed without prompts, prefer a narrow permission mode first:

```bash
claude -p --permission-mode dontAsk "review the current diff for bugs"
```

Use `--dangerously-skip-permissions` only in an externally sandboxed, trusted environment.

## Verification Sources

This skill was built from local `claude --help` output plus the public Claude Code CLI documentation.
