---
name: pr-triple-review
description: "Trigger: triple review, pr-triple-review, review this PR with bugbot claude codex, three-way PR review. Identify the current PR, trigger reviews from Bugbot, Claude Code, and Codex, then watch the PR and address findings as they land."
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
---

## Activation Contract

Use when the user wants a PR reviewed by all three of Bugbot, Claude Code (claude-code-action), and Codex, and wants findings triaged and fixed as they come in. Triggers: `/pr-triple-review`, "triple review this PR", "have bugbot claude and codex review", "three-way review".

Do not use for a single reviewer (use the runner skills directly) or for a local pre-push review (use `/review-bugbot`).

## Hard Rules

1. **Identify the current PR from conversation context only.** Never query GitHub to list open PRs. Source the PR from what the user said in this conversation (an explicit number/URL, or a PR discussed earlier). If none is evident, ask the user for the PR number or URL (one question, then stop and wait).
2. **Trigger reviews by posting PR comments with the exact trigger phrases** in the table below. Use `gh pr comment <N> --body "..."`. Post all three; do not wait between them unless the user asked for sequential.
3. **Never edit a finding you have not read in full.** Fetch the review body and inline comments verbatim with `gh pr view` / `gh api` before deciding fix vs. rebut.
4. **Address findings in source, not on the PR.** Apply a code fix, commit with a conventional commit, push. Only reply on the PR to post a rebuttal for a finding you reject, with the technical reason.
5. **Do not mark a finding resolved yourself.** Resolving/dismissing a review comment is the reviewer's or maintainer's call. You fix the code; the bot re-scans or the human dismisses.
6. **One commit per logical fix.** If two findings share a root cause, one commit. If unrelated, separate commits.
7. **Stop watching when the user says so**, or when all three reviews have posted AND every finding is either fixed-and-pushed or rebutted-and-noted.

## Review triggers (researched)

Each bot watches PR comments for a specific phrase. Post the phrase as a top-level PR comment.

| Reviewer | Trigger comment | Notes / source |
|----------|-----------------|----------------|
| **Bugbot** (Cursor) | `bugbot run` | Alias: `cursor review`. No `@` prefix; must be a standalone top-level comment (replies in a thread do not trigger). Bot reacts and runs async; posts inline comments + a `Cursor Bugbot` check. (cursor.com/docs/bugbot) |
| **Claude Code** (claude-code-action) | `@claude review once` | `@claude` prefix required; `review once` = single review without subscribing to future pushes (alias of `@claude review`). If the repo's workflow sets a custom `trigger_phrase`, the user must tell you the exact phrase. (code.claude.com/docs/en/code-review, github.com/anthropics/claude-code-action) |
| **Codex** (OpenAI) | `@codex review` | Bot reacts with 👀, then posts a review flagging P0/P1 only. Requires Codex cloud + Code review enabled in Codex settings. (developers.openai.com/codex/integrations/github) |

If a trigger comment gets no reaction within a few minutes, the bot is likely not installed/enabled for that repo. Tell the user which bot is silent and the setup link, then keep watching the others.

## Step 1 — Identify the current PR

Source the PR **only from the current conversation**. Never query GitHub to list open PRs.

1. **Argument**: user passed a number or URL (`/pr-triple-review 42` or `... https://github.com/o/r/pull/42`).
2. **Conversation context**: a PR number/URL the user mentioned earlier in this session, or a PR this session created/opened/reviewed.
3. **Nothing evident**: ask the user for the PR number or URL (one question, then stop and wait).

Once you have a candidate, confirm with the user (`"I'll run the triple review on #N — <title>. OK?"`) and proceed on yes. Ponytail: one short confirmation, do not over-ask.

After confirmation, capture: `PR_NUMBER`, `PR_URL`, `HEAD_REF`, `BASE_REF`, and a baseline `gh pr view <N> --json reviews,comments,statusCheckRollup` to distinguish new findings from pre-existing ones.

## Step 2 — Trigger all three reviews

Post a single PR comment containing all three trigger phrases, one per line. Each bot scans comments for its own phrase, so one comment triggers all three.

```bash
gh pr comment <N> --body "bugbot run
@claude review once
@codex review"
```

After posting, tell the user the three triggers are out and that you'll watch for reviews. Print the PR URL.

## Step 3 — Watch for reviews

Poll the PR for new reviews and inline comments. Between polls, return control to the user (do not spin a tight loop). A reasonable cadence: check every few minutes, or whenever the user prompts / the session wakes.

Each watch pass:

1. Fetch current state:
   ```bash
   gh pr view <N> --json reviews,comments,statusCheckRollup,reviewThreads
   gh api repos/{owner}/{repo}/pulls/{N}/comments   # inline review comments
   ```
2. **Diff against the baseline** from Step 1. Identify newly-arrived reviews and comments only. Track which you have already triaged (keep a mental/scratch ledger keyed by comment node id or review id).
3. For each **new** finding, classify by author and severity:
   - **Bugbot**: inline comments; severity from the comment. Check `Cursor Bugbot` check status.
   - **Claude**: review summary + inline comments from the `claude-code-action` bot.
   - **Codex**: review with P0/P1 inline comments (Codex only flags P0/P1).
4. Group findings that share a root cause. Address the highest-severity group first.

## Step 4 — Address each finding

For each finding (or group):

1. **Read it fully** — the exact comment text, the file, the line range. Open the file at the right location.
2. **Decide**: fix or rebut.
   - **Fix**: apply the minimal correct change (root cause, not symptom; grep every caller of the function you touch). Commit with a conventional commit message referencing the PR: `fix(scope): address <bot> finding on PR #N`. Push.
   - **Rebut**: only when the finding is wrong. Reply on the PR with the technical reason: `gh pr comment <N> --body "Re: <bot> finding on <file>:<line> — <why this is not an issue>."` Keep it technical and short.
3. **Record the outcome** in your scratch ledger: finding id → `fixed` (commit sha) or `rebutted` (reason).
4. Move to the next finding.

After a push, the bots may re-scan and post new findings or confirm resolutions. Loop back to Step 3.

## Step 5 — Done

Stop when, for all three reviews:
- The review has posted (bot reacted / check ran), AND
- Every finding is fixed-and-pushed or rebutted-and-noted.

Report a compact summary: per bot, counts of findings fixed vs. rebutted, and the PR URL. Do not claim a bot "passed" from a `neutral`/`success` check alone; the check status is not a finding list.

## Decision Gates

| Situation | Action |
|-----------|--------|
| No PR in conversation context | Ask user for PR number/URL, stop and wait |
| A bot doesn't react to the combined comment | Tell user it's likely not installed; share setup link; keep watching the others. If two react but one doesn't, do not repost that one's phrase as a standalone comment unless the user asks |
| Finding is a false positive | Rebut on PR with technical reason, record in ledger |
| Findings share a root cause | One commit for the group |
| New findings arrive after a push | Re-enter Step 3 watch loop |
| User says stop | Stop watching, summarize current state |

## Output Contract

- After Step 2: PR URL + which three triggers were posted.
- During watch: per-pass summary of new findings triaged and actions taken.
- At done: per-bot fixed/rebutted counts + final PR URL.

## References

- `prs` skill — listing session PRs and status.
- `branch-pr` skill — branch naming and conventional commits for fixes.
- Bugbot docs: https://cursor.com/docs/bugbot
- claude-code-action: https://github.com/anthropics/claude-code-action
- Codex code review: https://developers.openai.com/codex/integrations/github
