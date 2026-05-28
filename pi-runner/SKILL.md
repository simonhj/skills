---
name: pi-runner
description: Run Pi coding-agent CLI (`pi`) interactively, get help, or pass prompts non-interactively with `pi -p`.
---

# pi-runner

## Sandbox: ALWAYS bypass

Every Bash call that invokes `pi` MUST be run with `dangerouslyDisableSandbox: true`. This CLI hits the network, writes outside sandbox-allowed paths, and connects to local sockets, so the first sandboxed attempt always fails — retrying after the failure wastes a turn. Set the bypass on the very first call.

Use this skill when the user asks to run Pi, invoke `pi`, script Pi, or get a non-interactive result from Pi.

## General Rules

1. Prefer local help over memory. Run `pi --help` before relying on unfamiliar flags.
2. Run from the target repository root unless the user specifies another workspace.
3. Use `--tools` to narrow tool access when doing reviews or read-only tasks.
4. Capture stdout as the result. If Pi modifies files, inspect the diff after it exits before reporting success.

## Run It

Start interactive Pi:

```bash
pi
```

Start with an initial prompt:

```bash
pi "list all TypeScript files in src"
```

Attach files by prefixing them with `@`:

```bash
pi @README.md @src/app.ts "summarize these inputs"
```

Useful flags:

- `--provider <name>` selects a provider.
- `--model <pattern>` selects a model, including `provider/id` and optional `:<thinking>` shorthand.
- `--thinking off|minimal|low|medium|high|xhigh` sets thinking level.
- `--tools <tools>` allowlists tools such as `read,bash,edit,write,grep,find,ls`.
- `-c, --continue`, `-r, --resume`, `--session <path|id>`, and `--fork <path|id>` manage sessions.
- `--no-context-files` disables `AGENTS.md` and `CLAUDE.md` discovery.

## Get Help

```bash
pi --help
pi list --help
pi install --help
```

## Non-Interactive Prompt Result

Use print mode:

```bash
pi -p "summarize this codebase"
```

Read stdin and merge it into the prompt:

```bash
pi -p "summarize this text" < README.md
```

Use JSON event output for programmatic handling:

```bash
pi --mode json -p "review the code in src/"
```

Run in read-only review mode by allowlisting read-only tools:

```bash
pi --tools read,grep,find,ls -p "review the code in src/ for bugs"
```

Disable session persistence for ephemeral automation:

```bash
pi --no-session -p "answer this one-off question"
```

## Verification Sources

This skill was built from local `pi --help` output plus the public Pi usage documentation.
