---
name: codex-runner
description: Run OpenAI Codex CLI (`codex`) interactively, get help, or pass prompts non-interactively with `codex exec`.
---

# codex-runner

Use this skill when the user asks to run OpenAI Codex, invoke `codex`, script Codex, or get a non-interactive result from Codex.

## General Rules

1. Prefer local help over memory. Run `codex --help` and `codex exec --help` before relying on unfamiliar flags.
2. Run from the target repository root unless the user specifies another workspace.
3. Use explicit sandbox settings for automation when possible.
4. Capture stdout as the result. If Codex modifies files, inspect the diff after it exits before reporting success.

## Run It

Start the interactive Codex TUI:

```bash
codex
```

Start interactive mode with an initial prompt:

```bash
codex "explain this repository"
```

Useful flags:

- `-C, --cd <dir>` sets the working root.
- `-m, --model <model>` selects the model.
- `-s, --sandbox <mode>` selects `read-only`, `workspace-write`, or `danger-full-access`.
- `--search` enables live web search.
- `--add-dir <dir>` grants additional writable directories.

## Get Help

```bash
codex --help
codex exec --help
codex review --help
```

## Non-Interactive Prompt Result

Use `codex exec`:

```bash
codex exec "summarize the codebase"
```

Set the working directory explicitly:

```bash
codex exec -C /path/to/repo "find likely causes of the failing tests"
```

Read the prompt from stdin:

```bash
codex exec - < prompt.md
```

Write the final answer to a file and stream events as JSONL:

```bash
codex exec --json --output-last-message result.md "review the current diff"
```

Use `--dangerously-bypass-approvals-and-sandbox` only when the caller has already sandboxed the process externally.

## Verification Sources

This skill was built from local `codex --help` and `codex exec --help` output plus the public OpenAI Codex CLI documentation.
