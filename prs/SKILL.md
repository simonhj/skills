---
name: prs
description: "Trigger: prs, in-flight PRs, open pull requests, PR status. List PRs from this session with clickable URLs and up-to-date status summaries. Detects stacked PRs and highlights them."
license: Apache-2.0
metadata:
  author: opencode
  version: "1.1"
---

## Activation Contract

Use when the user wants to see PRs created **in this working session** — their own in-flight branches, not every open PR in the repo. Also activates on any request mentioning "PR status", "my PRs", "in-flight PRs", or "what did I open".

## Hard Rules

1. **Scope is session-first, not repo-wide.** Start by looking for PRs tied to the current user's work. Only expand to all open PRs if the user explicitly asks (e.g. "show all open PRs").
2. **Always use `gh pr list --json --author @me`** as the primary query. Never use the web browser.
3. **Cross-reference with session state.** Check the active workstream (via `hub_list_workstreams` + `hub_workstream_status`) for attached PRs. Also check `git branch` for recently created local branches that may have open PRs.
4. **If `gh` is not authenticated or not installed**, stop and tell the user to run `gh auth login`.
5. **Collect status in parallel** when there are 2+ session PRs. Spawn one subagent per PR to run `gh pr view <number> --json`.
6. **Detect stacked PRs** by checking if any PR's `baseRefName` equals another PR's `headRefName`. Also try `gh stack view --json` if the repo appears to use `gh-stack`.
7. **Print clickable URLs** for every PR. Use markdown link format: `[#N: Title](url)`.
8. **Summarize status** with these fields: mergeStateStatus, reviewDecision, statusCheckRollup (counts of pass/fail/pending), isDraft, and latest review state.

## Decision Gates

| Situation | Action |
|-----------|--------|
| User asks for "my PRs" / "session PRs" / "what I opened" | Use `--author @me` and workstream attachments. |
| User asks for "all open PRs" / "repo PRs" | Use `gh pr list --state open` without author filter. |
| `gh pr list --author @me` returns 0 PRs | Print "No PRs from you in this session." and stop, unless user asked for all. |
| `gh pr list` returns 1 PR | Collect status inline (no subagent). |
| `gh pr list` returns 2+ PRs | Spawn parallel subagents to collect per-PR status. |
| `gh stack view --json` succeeds | Use stack data to annotate PRs with stack position (bottom/top). |
| Stacked PRs detected | Add a visual header and prose description of the stack order. |

## Execution Steps

1. **Determine scope from user intent.** If the user said "all open PRs" or "repo PRs", skip to step 3. Otherwise, proceed session-scoped.

2. **Find session PRs** (try in order until you have candidates):
   a. Check the active workstream for attached PR links: `hub_workstream_status` on the current workstream, look for `kind: pr` attachments.
   b. List PRs authored by the current user: `gh pr list --json number,title,url,headRefName,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,author,createdAt --author @me --state open`
   c. Cross-reference with recently created local branches: `git branch --sort=-creatordate` (or `--sort=-committerdate`) and match `headRefName`.
   d. If zero session PRs found, report: "No PRs from this session." and stop.

3. **(Fallback) List all open PRs** — only if explicitly requested:
   ```bash
   gh pr list --json number,title,url,headRefName,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,author,createdAt --state open
   ```

4. **Detect stacks** (two methods, try both):
   - Run `gh stack view --json 2>/dev/null`. If it succeeds, extract branch→PR mappings.
   - Manual fallback: check if any PR's `baseRefName` matches another PR's `headRefName`.

5. **Collect detailed status**:
   - If 1 PR: run `gh pr view <number> --json reviews,commits,comments,mergeStateStatus,statusCheckRollup` inline.
   - If 2+ PRs: spawn a `task` subagent per PR with prompt: "Run `gh pr view <NUMBER> --json reviews,commits,comments,mergeStateStatus,statusCheckRollup` and return the raw JSON output. Do not summarize."

6. **Render output** in this order:
   - If stacked: print a `## Stacked PRs` section first with an ASCII or prose diagram showing the dependency chain.
   - Then print `## Session PRs` (or `## All Open PRs` if in fallback mode) with one block per PR:
     - Clickable URL: `[#N: Title](url)`
     - Author, created date
     - Merge status: `mergeStateStatus`
     - Review status: `reviewDecision`
     - Checks: count of pass / fail / pending from `statusCheckRollup`
     - Draft badge if `isDraft`
     - Stack position if applicable (e.g., "Stack: bottom → 2 of 3")

7. **Visual callout for stacked PRs**:
   - Use a markdown blockquote or bold header: `> 🔗 Stacked: PR #1 → PR #2 → PR #3`
   - In prose: "These PRs form a stack. PR #1 is the bottom (closest to trunk) and PR #3 is the top. They must land in order."

## Output Contract

Return a markdown summary scoped to the user's session work. Include clickable links. Call out stacked PRs both visually and in prose. If no session PRs exist, say so clearly before offering to show all open PRs.

## References

- `gh-stack` skill for stacked PR management details.
- `gh pr list --help` and `gh pr view --help` for available JSON fields.
