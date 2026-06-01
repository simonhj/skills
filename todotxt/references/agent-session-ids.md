# Agent-Added Task Metadata

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

## Detecting the session ID

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
| **cursor** (Cursor Agent CLI) | _(none — Cursor does not expose the conversation ID via env vars; it only pipes it to hooks via STDIN. Tracked as a [feature request](https://forum.cursor.com/t/cursor-conversation-id-through-environment-variables/160346).)_ | Omit the `session:` tag. Still include `agent_added:t` and `agent:cursor`. |

**Last-resort fallback only:** if you genuinely don't know which agent you're running as, `env | grep -iE '(opencode|claude|codex|cursor|pi)'` can be used to discover the right variable. Don't run this as the default workflow — pick the var from the table above. If no suitable variable exists, omit `session:` but still include `agent_added:t` and `agent:<name>`.
