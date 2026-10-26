---
name: babysit-pr
description: "Trigger: babysit PR, babysit-pr, get this PR merged, land this PR, drive it to merge, watch the merge queue. Take a finished PR the rest of the way: green CI, into the merge queue, watch until merged. May fix only trivial non-semantic issues such as merge conflicts, formatting, and flaky reruns."
license: Apache-2.0
metadata:
  author: simonhj
  version: "1.1"
---

## Activation Contract

Use when the PR's design and behavior are already decided and all that is left is
mechanical: make CI pass, satisfy merge requirements, enqueue, and watch until
`state: MERGED`. Triggers: `/babysit-pr`, "babysit this PR", "get #N merged",
"land this", "drive it to the merge queue", "keep watching until it merges".

Do **not** use when the PR still needs review-driven code changes, design
decisions, or scope adjustments — that is normal PR work, not babysitting.

## Hard Rules

1. **The PR is frozen semantically.** Its behavior, API, tests, and scope were
   decided before this skill ran. Your job is transport, not authorship. The test
   for any edit: *does it change what the code does on any input, or what ships?*
   If unsure, escalate — "the repo's tool did it" is not proof of equivalence.

   | Allowed (trivial) | Forbidden (semantic) |
   |---|---|
   | Merge or rebase the base in, resolving textual conflicts | Resolve a conflict by choosing behavior for either side |
   | Run the repo's formatter/lint autofix **on PR-touched files only**, after reading the diff | Hand-fix lint by changing logic; reformat unrelated files |
   | Re-run flaky or infrastructure-failed jobs | Weaken, skip, delete, or quarantine a failing test |
   | Fix a typo in the PR description without changing its claims | Change scope, title intent, base branch, or amend published commits |
   | Regenerate a generated file with the repo's own command when the diff has no version or behavior change | Dependency/action-version bumps, config or threshold changes, hand-edited generated files |

2. **Never bypass a gate.** No `--admin`, force-merge, fake check status, review
   dismissal, thread resolution, `continue-on-error`, or branch-protection edits.
3. **Bind every mutation to the identified PR.** Before local changes, verify a
   clean worktree, the PR's head repository and branch, that the checkout is that
   branch, the push destination, and that you are authorized to update it. Push
   normally after merging the base. Rebase only when history rewriting is
   authorized, and force-push with `--force-with-lease=<ref>:<observed-remote-sha>`.
   Never plain `--force`.
4. **Pin the commit you assessed.** Re-snapshot the head after every push. Merges
   pass `--match-head-commit <assessed-sha>` (or GraphQL `expectedHeadOid`). If the
   head moved, reassess before proceeding; never merge an unassessed commit.
5. **Stay inside this PR.** No direct pushes to the base and no changes to other
   PRs; the authorized GitHub merge is the only thing that updates the base. If the
   base branch is another open PR's head (stacked PR), stop and ask — do not merge
   dependencies or retarget.
6. **One retry per failure cause.** Same check red twice for the same reason, or a
   second failure after a trivial fix: escalate. Do not push again. The budget
   survives a new run, merge group, or re-enqueue.
7. **Report only observed state.** A check is green when `gh pr checks` says so; a
   PR is merged when `gh pr view --json state` returns `MERGED`.

## Workflow

### 1. Identify and snapshot

Source the PR from the conversation (number, URL, or current branch). If none is
evident, ask once and stop.

```bash
gh pr view <N> --json number,url,title,state,isDraft,baseRefName,headRefName,headRefOid,headRepository,headRepositoryOwner,maintainerCanModify,mergeable,mergeStateStatus,reviewDecision,autoMergeRequest,statusCheckRollup,mergeCommit
```

Record the base branch, head SHA, draft state, review decision, and whether the
base branch requires a merge queue (rulesets/branch protection, plus
`repository.mergeQueue(branch: <base>)`). A queue existing elsewhere in the repo
does not apply to this PR.

### 2. Clear the cheap blockers

- **Draft** → `gh pr ready <N>` only if the user says the PR is finished.
- **Conflicts or required update** — `mergeable == CONFLICTING`, or
  `mergeStateStatus == BEHIND` (a separate enum; `mergeable` is
  `MERGEABLE`/`CONFLICTING`/`UNKNOWN`). Resolve textual conflicts only, run the
  formatter if it is part of the normal flow, push. `UNKNOWN` → wait and re-query.
- **Missing approval or changes requested** → not yours to fix. Report the blocker
  and continue only with what is not blocked.

### 3. Drive CI green

```bash
gh pr checks <N> --required    # required checks only
gh pr checks <N>               # every reported check
gh pr checks <N> --watch --fail-fast
gh run view <run-id> --log-failed
gh run rerun <run-id> --failed # one retry per failure cause
```

`statusCheckRollup` is not an inventory of requirements: a required workflow that
never started leaves the PR blocked. Check applicable rulesets, and escalate rather
than weakening configuration.

| Failure | Action |
|---|---|
| Infra, timeout, or runner death | Rerun once. |
| Flake in a test this PR's diff does not exercise | Rerun once. Recurrence → escalate. |
| Formatting, lint, or generated-file mismatch | Apply the repo's own fix command, read the diff, commit, push. |
| Real failure in code this PR changed | **Escalate.** Do not fix semantics. |
| Failure on the base branch or another PR | Report and wait; do not fix. |

### 4. Enqueue or merge

Only when required checks are green and approvals are in place.

- **Queue-required base** → enqueue, pinned to the assessed head:

  ```bash
  gh pr merge <N> --match-head-commit <sha> --auto
  ```

  If the CLI cannot enqueue (auto-merge disabled, queue-only branch), use:

  ```bash
  gh api graphql -f query='
    mutation($id:ID!,$oid:GitObjectID){ enqueuePullRequest(input:{pullRequestId:$id,expectedHeadOid:$oid}){ mergeQueueEntry { position state } } }' \
    -f id="$(gh pr view <N> --json id -q .id)" -f oid="<sha>"
  ```

  The queue controls the merge strategy; `gh pr merge` needs whichever method it
  accepts for that branch, so pass the queue's configured strategy.

- **No queue** → `gh pr merge <N> --match-head-commit <sha> --auto` (or the
  permitted method, if the user wants it merged now). Determine permitted methods
  with `gh repo view --json mergeCommitAllowed,squashMergeAllowed,rebaseMergeAllowed`;
  several can be true, so use the repo's documented or conventional method and ask
  when ambiguous. `--auto` can merge immediately once requirements are met: use it
  only with authorization to merge, not merely to watch.

### 5. Watch

Poll every 60–90s and report state changes, not ticks:

```bash
gh pr view <N> --json state,isDraft,mergeStateStatus,reviewDecision,autoMergeRequest,headRefOid,statusCheckRollup
gh api graphql -f query='{repository(owner:"<o>",name:"<r>"){mergeQueue(branch:"<base>"){entries(first:100){pageInfo{hasNextPage endCursor} nodes{position state pullRequest{number}}}}}}'
```

Track this PR's entry (paginate; absence from one page is not proof of ejection) and
inspect checks for the **merge-group** commit, not just the PR head. Refresh draft,
review, and auto-merge state each pass.

- Checks run on a merge group of several PRs. Failure attributable to another entry
  or to infrastructure → wait or re-enqueue within the retry budget. Attribution
  comes from logs and reproduction, **not** from the failing file being outside this
  PR's diff.
- Failure this PR causes, or uncertain attribution → **semantic**. Stop and hand
  back with the logs.
- Entry removed from the queue → diagnose the cause first. If a human dequeued it,
  do not re-enqueue; report.
- Stalled queue, or a required workflow that never starts → report after the agreed
  observation window rather than retrying forever.

For long waits, run the poll as an async subagent that only reports; nothing in the
child may push code.

### 6. Confirm and report

On `MERGED`:

```bash
gh pr view <N> --json state,url,mergeCommit   # report mergeCommit.oid
```

Stop on `MERGED`, on `CLOSED`, on escalation, or when the user says stop. Delete the
local branch only if asked. At handoff, say whether server-side auto-merge or a
queue entry is still active.

## Decision Gates

| Situation | Action |
|---|---|
| Fix changes behavior, tests, deps, scope, or shipped config | Stop and escalate; do not draft the semantic patch. |
| Conflict needs a judgment call between two behaviors | Stop and ask which side's semantics win. |
| Required approval, review, or required workflow missing | Report the blocker; never merge around it. |
| Head SHA changed since assessment | Reassess before any merge or enqueue. |
| PR ejected from the queue | Diagnose; re-enqueue only if trivial and no human acted. |
| Same check red twice | Escalate with logs; no further pushes. |

## Output Contract

Progress reports are short: current state (`checks`/`queue`/`merged`), what you
changed and why it was non-semantic, and what is blocking. Final report: PR URL,
merge commit SHA or the reason it is not merged, every change made (labeled trivial
with the rule it satisfied), and every escalation with the log line and the decision
the user must make.

## References

- `prs` skill — session PR listing and status.
- `pr-triple-review` skill — when the PR still needs review findings addressed.
- `gh pr checks`, `gh pr merge`, `gh run rerun --help`; merge queue docs:
  https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
