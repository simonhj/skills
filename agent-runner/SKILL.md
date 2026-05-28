---
name: agent-runner
description: Route requests about running external coding-agent CLIs to the focused runner skill for Claude Code, Codex, Cursor, opencode, Pi, or GitHub Copilot.
---

# agent-runner

## Sandbox: ALWAYS bypass

Every Bash call that invokes one of these runner CLIs (`claude`, `codex`, `cursor`/`agent`/`cursor-agent`, `opencode`, `pi`, `copilot`, `gh copilot`) MUST be run with `dangerouslyDisableSandbox: true`. These CLIs hit the network, write outside sandbox-allowed paths, and connect to local sockets, so the first sandboxed attempt always fails — retrying after the failure wastes a turn. Set the bypass on the very first call. This rule applies to all per-agent runner skills below.

Use this skill when the user asks generally about running, comparing, orchestrating, delegating to, or collecting output from external coding-agent CLIs.

## When to use

Use the focused per-agent skills for concrete commands:

- `claude-runner` for Claude Code: `claude`
- `codex-runner` for OpenAI Codex: `codex`
- `cursor-runner` for Cursor Agent: `agent`, `cursor-agent`, or `cursor agent`
- `opencode-runner` for opencode: `opencode`
- `pi-runner` for Pi: `pi`
- `copilot-runner` for GitHub Copilot CLI: `copilot` or `gh copilot`

## General Rules

1. Prefer the local CLI help over memory because these tools change quickly. Run `<tool> --help` and, for non-interactive subcommands, `<tool> <subcommand> --help` before relying on a flag you have not used in this environment.
2. Run agents from the target repository root unless the user specifies a different workspace. Use the CLI's workspace flag when available instead of changing directories inside a prompt.
3. Quote prompts as a single shell argument for simple one-shot use. For long prompts, pipe stdin or pass a prompt file when the tool supports it.
4. Choose the least-privileged permission mode that can complete the task. Only use all-tools, yolo, force, or dangerous bypass flags when the task requires autonomous edits or shell commands and the environment is trusted.
5. For scripted calls, request machine-readable output when available: JSON, JSONL, or stream JSON.
6. Capture stdout as the result. If the agent modifies files, inspect the diff after it exits before reporting success.
7. If a CLI is missing, tell the user the command was not found and include the install or auth command if the tool's docs/help provide one.
