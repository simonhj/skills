# Agent Instructions — Skills Installation

This repository contains skills for AI agents. When new or updated skills are available, install them globally across all supported agents using the `skills` CLI.

## Prerequisites

The `skills` CLI is invoked via `npx` (no global installation required):

```bash
npx skills --version   # verify CLI is available
```

## Install a skill globally (symlinks)

Symlinks are the default install mode. Run this from any directory:

```bash
npx skills add <package-or-repo> \
  -g \
  --agent claude codex cursor opencode pi \
  -y
```

**Example:**

```bash
npx skills add vercel-labs/agent-skills \
  -g \
  --agent claude codex cursor opencode pi \
  -y
```

### Flags explained

| Flag | Meaning |
|------|---------|
| `-g` | Install globally (user-level) instead of project-level |
| `--agent` | Target specific agents. Accepts aliases: `claude` (→ claude-code), `codex`, `cursor`, `opencode`, `pi` |
| `-y` | Skip confirmation prompts |

### What happens

- The skill is cloned/cached once into a global store.
- Symlinks are created into each agent's global skills directory:
  - `~/.claude/skills`
  - `~/.agents/skills` (Codex, Cursor)
  - `~/.config/opencode/skills`
  - `~/.pi/agent/skills`

Use `--copy` instead if you need physical file copies (slower, more disk usage).

## Update global skills

Update all globally-installed skills to their latest versions:

```bash
npx skills update -g -y
```

To update a single skill by name:

```bash
npx skills update <skill-name> -g -y
```

## Verify installed skills

List all globally-installed skills and which agents they are linked to:

```bash
npx skills list -g
```

Machine-readable output:

```bash
npx skills list -g --json
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Skill not appearing in an agent | Check the symlink with `ls -la <agent-skills-dir>` and re-run the install command. |
| Broken symlink after moving directories | Re-install the skill with `npx skills add <package> -g --agent <agent> -y`. |
| Want project-level only | Omit `-g` and run from the project root. The skill installs to `.agents/skills/` and is recorded in `skills-lock.json`. |

## Reference

- Full CLI help: `npx skills --help`
- Skill discovery: `npx skills find <keyword>`
