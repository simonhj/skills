---
name: prs
description: "Trigger: prs, in-flight PRs, open pull requests, PR status. List all open PRs with clickable URLs and up-to-date status summaries. Detects stacked PRs and highlights them."
license: Apache-2.0
metadata:
  author: opencode
  version: "1.0"
---

## Activation Contract

Use when the user wants to see all open (in-flight) pull requests for the current repository, with full status summaries and clickable URLs. Also activates on any request mentioning "PR status", "open PRs", or "in-flight PRs".

## Hard Rules

1. **Always use `gh pr list --json`** as the primary source. Never use the web browser.
2. **If `gh` is not authenticated or not installed**, stop and tell the user to run `gh auth login`.
3. **Collect status in parallel** when there are 2+ PRs. Spawn one subagent per PR to run `gh pr view <number> --json`.
4. **Detect stacked PRs** by checking if any PR's `baseRefName` equals another PR's `headRefName`. Also try `gh stack view --json` if the repo appears to use `gh-stack`.
5. **Print clickable URLs** for every PR. Use markdown link format: `[#N: Title](url)`.
6. **Summarize status** with these fields: mergeStateStatus, reviewDecision, statusCheckRollup (counts of pass/fail/pending), isDraft, and latest review state.

## Decision Gates

| Situation | Action |
|-----------|--------|
| `gh pr list` returns 0 PRs | Print "No open PRs." and stop. |
| `gh pr list` returns 1 PR | Collect status inline (no subagent). |
| `gh pr list` returns 2+ PRs | Spawn parallel subagents to collect per-PR status. |
| `gh stack view --json` succeeds | Use stack data to annotate PRs with stack position (bottom/top). |
| Stacked PRs detected | Add a visual header and prose description of the stack order. |

## Execution Steps

1. **List open PRs**:
   ```bash
   gh pr list --json number,title,url,headRefName,baseRefName,isDraft,mergeStateStatus,reviewDecision,statusCheckRollup,author,createdAt --state open
   ```

2. **Detect stacks** (two methods, try both):
   - Run `gh stack view --json 2>/dev/null`. If it succeeds, extract branch→PR mappings.
   - Manual fallback: check if any `baseRefName` matches another PR's `headRefName`.

3. **Collect detailed status**:
   - If 1 PR: run `gh pr view <number> --json reviews,commits,comments` inline.
   - If 2+ PRs: spawn a `task` subagent per PR with prompt: "Run `gh pr view <NUMBER> --json reviews,commits,comments,mergeStateStatus,statusCheckRollup` and return the raw JSON output. Do not summarize."

4. **Render output** in this order:
   - If stacked: print a `## Stacked PRs` section first with an ASCII or prose diagram showing the dependency chain.
   - Then print `## All Open PRs` with one block per PR:
     - Clickable URL: `[#N: Title](url)`
     - Author, created date
     - Merge status: `mergeStateStatus`
     - Review status: `reviewDecision`
     - Checks: count of pass / fail / pending from `statusCheckRollup`
     - Draft badge if `isDraft`
     - Stack position if applicable (e.g., "Stack: bottom → 2 of 3")

5. **Visual callout for stacked PRs**:
   - Use a markdown blockquote or bold header: `> 🔗 Stacked: PR #1 → PR #2 → PR #3`
   - In prose: "These PRs form a stack. PR #1 is the bottom (closest to trunk) and PR #3 is the top. They must land in order."

## Output Contract

Return a markdown summary. Include clickable links. Call out stacked PRs both visually and in prose. If no PRs are open, say so clearly.

## References

- `gh-stack` skill for stacked PR management details.
- `gh pr list --help` and `gh pr view --help` for available JSON fields.
