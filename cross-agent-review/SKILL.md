---
name: cross-agent-review
description: Converge a plan or code change through multiple rounds of adversarial review by an external coding agent (e.g. Claude asks Codex). The reviewer returns blocker/high/medium findings; the host validates each, applies fixes or records a rebuttal, then re-invokes the reviewer with carried-forward context. Loops until no blockers (and no high) remain or a max round cap is hit.
---

# cross-agent-review

Drive a target — a **plan document** or a **code change** — to convergence through repeated adversarial review by a *different* coding agent than the one running this skill.

The agent running this skill is the **host** (the primary/receiving agent). The host holds the work, applies fixes, and acts as judge. A separate external CLI (Codex, Cursor, opencode, Copilot, Pi — or Claude when it isn't the host) is the **reviewer**: it never edits, it only critiques. Using a different model family for the reviewer is the whole point — an external critic catches what self-review cannot (self-review without external feedback tends to degrade, not improve; arXiv:2310.01798).

The loop:

```
host prepares target + carried context
  └─► reviewer critiques  (blocker / high / medium findings, structured)
        └─► host validates each finding: APPLY a fix, or REJECT with a written rebuttal
              └─► re-invoke reviewer with carried context (fixes made + upheld rebuttals)
                    └─► repeat until gate met (reviewer verifies fixes, no blockers, no high by default)
                          or dry / stalled / max rounds → escalate
```

## When to use

Use when the user wants to **stress-test and harden** a plan or a code change with an independent second agent until it holds up — "have Codex tear this apart and converge", "adversarially review this plan", "run a convergence loop on this diff", "review until no blockers remain". Triggers: `/cross-agent-review`, or phrasing about cross-AI / cross-agent / adversarial review, multi-round review, review-until-clean.

Do **not** use for a one-shot review with no fix/re-review loop — for that, just invoke a runner skill (`codex-runner`, etc.) directly once. This skill is specifically the *converging loop*.

This skill is intentionally **GSD-agnostic**: it works on any repo, has no dependency on `.planning/`, phases, or `gsd-sdk`. (It is the generic cousin of GSD's `gsd-plan-review-convergence`, plus a push-back/rebuttal gate that GSD lacks.)

## Arguments

```
/cross-agent-review <target> [options]
```

**`<target>`** — what to review. One of:
- a **path to a plan/design doc** (e.g. `~/ai-plans/foo.md`) → fixes are edits to that doc.
- `--diff [<base>]` → the diff `<base>..HEAD` (default base: the merge-base with the default branch) → fixes are edits to source.
- `--branch <name>` → that branch's diff against the default branch. Fixes edit the working tree, so the branch **must be checked out** before fixes are applied; if it isn't, either check it out (or make a worktree) with the user's OK, or run **review-only** and report that no fixes were applied.
- *(omitted / `--working-tree`)* → the current uncommitted working tree (staged + unstaged) → fixes are edits to source.
- a free-text description in quotes → treated as the plan to review (host writes it to the scratch dir first).

**Options:**
| Flag | Default | Meaning |
|---|---|---|
| `--reviewer <name>` | auto (cross-vendor) | Force the reviewer CLI: `codex`, `cursor`, `opencode`, `copilot`, `pi`, `claude`. |
| `--panel [a,b,c]` | off (single) | Run a multi-reviewer panel each round instead of one reviewer. With no list, picks up to 3 available non-host CLIs. |
| `--max-rounds N` | `3` | Hard cap on review rounds. |
| `--only-blockers` | off | Gate convergence on **blockers only**; high/medium are reported but never keep the loop running. (Default gate is **blockers + high**.) |
| `--auto` | off | Fully autonomous: never pause to ask the user. Disputed blockers are rejected with a recorded rebuttal and the loop continues. (Default: pause and ask the user to rule on any disputed **blocker**.) |
| `--scratch <dir>` | `/tmp/cross-agent-review/<slug>/` | Where round artifacts are written (outside the repo by default, so nothing needs git-ignoring). |

## Step 0 — Set up

1. **Resolve the target** and its kind (`plan-doc` | `code`). For `code`, capture the initial diff and changed-file list up front; **regenerate the diff after every round of edits** before re-invoking the reviewer, so the reviewer never sees a stale target.
2. **Pick the reviewer(s).** The reviewer **must be a different model family than the host.** You inherently know your own model family — use that; the env vars below are only confirmation, not the source of truth.
   - `CLAUDE_CODE_ENTRYPOINT` set → host is Claude → **default reviewer: `codex`**.
   - `CURSOR_SESSION_ID` set → host is Cursor → default reviewer: `codex`.
   - Otherwise pick `codex` if you are not Codex, else `cursor`.
   - **Always self-skip the host CLI** so an agent never reviews its own family. Honor `--reviewer` / `--panel` over the default, but still refuse the host as reviewer (warn and pick another).
   - **Fail closed**: if you cannot determine your own family with confidence, do not guess a default — ask the user or require `--reviewer`.
   - **Independence is about model *family*, not CLI brand.** Cursor, opencode, Copilot, and Pi can each be pointed at any provider — a different CLI is not automatically a different family. Make sure the reviewer's *actual* model is a different family than the host's; if a CLI's model is configurable or unknown, pin it with a model flag or confirm with the user, else fail closed.
   - Confirm the chosen reviewer CLI is installed (`<cli> --help`); if not, fall back to the next available non-host CLI and tell the user which you picked.
3. **Create the scratch dir** (`--scratch` or `/tmp/cross-agent-review/<slug>/`). Keep artifacts outside the repo by default so nothing pollutes the working tree or needs git-ignoring; tell the user the path. Initialize `ledger.md` (the running audit trail).
4. **Announce the plan**: target, reviewer(s), gate (`blockers+high` or `--only-blockers`), max rounds, dispute mode (`escalate` or `--auto`).

## Step 1 — Reviewer invocation (per round)

Reviewers run **read-only** and you call their CLI via Bash. Every such Bash call **MUST set `dangerouslyDisableSandbox: true`** — these CLIs hit the network and local sockets, so the first sandboxed attempt always fails (see the `codex-runner` / `cursor-runner` / etc. skills). Set the bypass on the very first call.

**Enforcing read-only and working directory:**
- Use each reviewer's **enforced** read-only / least-privilege flags from its matching runner skill — e.g. Codex `--sandbox read-only`, Cursor ask mode, Pi `--tools read,grep,find,ls`. A prompt instruction like "do not edit" is **not** a boundary: with the sandbox bypassed, only a real flag or permission setting constrains the CLI. Do not auto-select a reviewer whose runner skill lacks a verified enforced read-only / plan-only mode for the exact command (e.g. opencode or Copilot configured to allow writes) — warn the user and pick another, or get explicit acceptance of the risk.
- **Guard against reviewer edits — safely.** The target may be a dirty working tree, so a blind post-run revert could destroy the user's uncommitted work. *Before* each invocation, snapshot a baseline (`git status --porcelain` plus a `git diff` capture of tracked + untracked state); *after* it, diff against that baseline. Anything outside the scratch dir that the reviewer changed is an untrusted mutation — undo **only that delta**, preserving the user's pre-existing changes. If you can't cleanly isolate the reviewer's delta, **stop and ask the user** rather than reverting.
- Run every reviewer **from the repo root** (or pass its workspace/dir flag, e.g. opencode `--dir`, so it can open the files the request references). Diff-only review with no access to surrounding files misses systemic issues.

Write the round's request to `round-<N>-request.md` in the scratch dir, then point the reviewer at it. The request file contains, in this order:

1. **Role & rules** (the adversarial contract — see below).
2. **What to review**: for a plan, the plan path + inline contents; for code, the diff plus the list of changed files (instruct the reviewer to also open the surrounding files for cross-module context).
3. **Carried context** (rounds ≥ 2 only): the pending finding records described in Step 3 — for each finding the host acted on, its `id`, `severity`, `location`, original `claim`, the host action, and the one-line fix summary or rebuttal — so the reviewer verifies against the original defect and won't blindly re-raise it (it may still concede or strengthen its case).
4. **Output contract** (the structured format below).

Canonical read-only invocations (adapt flags from the matching runner skill; pass the request via stdin or file, capture the final message):

```bash
# Codex (default reviewer)
codex exec --sandbox read-only --json --output-last-message <scratch>/round-<N>-findings.txt - < <scratch>/round-<N>-request.md
# Cursor — read-only ask mode
agent -p --mode ask --output-format json "Read <scratch>/round-<N>-request.md and follow it."
# opencode — only if its permission config denies writes (see opencode-runner); prompt text alone is not a read-only boundary
opencode run --dir . --format json "Read <scratch>/round-<N>-request.md and follow it. Do not edit any files."
# Copilot / Pi — read-only equivalents (see the runner skills; Pi: --tools read,grep,find,ls)
```

In **panel** mode, invoke each reviewer the same way (they may run in parallel via separate backgrounded Bash calls). After collecting all panel findings, the host **dedupes** near-identical findings and **promotes** any finding independently raised by ≥2 reviewers up one severity level (an ensemble-confidence signal; N-CRITICS, arXiv:2310.18679). The host then **writes a single canonical `round-<N>-findings.md`** for the merged set **in the normal reviewer-contract format** — the fenced JSON array followed by a host-computed `REVIEW_SUMMARY` line — and Step 2 parses *that* file, not the individual reviewer outputs (whose counts no longer match after dedupe/promotion). When reviewers disagree on a prior finding's status, **the open status dominates**: keep it open if *any* reviewer marks it `NEW` / `UNRESOLVED` / `PARTIAL`; mark `RESOLVED` only if all reviewers addressing it agree, and `CONCEDED` only if all reviewers addressing a rejected finding concede it.

### The adversarial contract (put this in the request file)

> You are an adversarial reviewer. Treat the work as broken until proven otherwise — your job is to find what's wrong, not to praise it. Do **not** rubber-stamp. If you genuinely find nothing of a given severity, say so explicitly rather than inventing nitpicks.
>
> Classify every finding as exactly one of:
> - **BLOCKER** — a correctness, security, data-loss, or spec-violation defect that makes this unacceptable as-is.
> - **HIGH** — a likely bug, missing error handling, unhandled edge case, or significant risk/gap that should be fixed.
> - **MEDIUM** — a real maintainability/quality/edge-case improvement worth making. Do **not** emit pure style/formatting nits; fold trivial points into MEDIUM only if they carry real risk, otherwise omit them.
>
> For each finding give: a short `id`, `severity`, `location` (file:line or section), `claim` (what's wrong), `why` (impact), `suggested_fix`, and `status`. Every newly discovered finding — including **every first-round finding** — has status `NEW`.
>
> **On a re-review round**, for every prior finding listed in the carried context, first report its `status` as exactly one of:
> - `RESOLVED` — the change correctly fixes it (verify against the actual current code/plan; do **not** assume a fix is correct because it was attempted).
> - `PARTIAL` — attempted but incomplete/incorrect (explain).
> - `UNRESOLVED` — not fixed.
> - `CONCEDED` — a finding the author rejected whose rebuttal you now accept as correct (it was never a real issue).
>
> Then add any newly discovered findings with status `NEW`. For findings the author rejected with a rebuttal: independently judge each — mark it `CONCEDED` if the rebuttal holds, or restate it (`UNRESOLVED`) with a stronger, specific argument if it does not.
>
> End your response with one machine-readable line, exactly:
>
> `REVIEW_SUMMARY: blockers=<N> high=<M> medium=<K>`
>
> where the counts are findings that **remain unresolved** after this round — i.e. status `NEW`, `UNRESOLVED`, or `PARTIAL`. Exclude anything marked `RESOLVED` or `CONCEDED`. Immediately before the summary, output a fenced ```json block containing the array of all findings with their fields and (on re-review) statuses.

## Step 2 — Host validates the findings (the push-back gate)

**Parse the JSON findings block first — it is the source of truth.** Recompute the gate counts yourself from each finding's `severity` + `status` (count only `NEW` / `UNRESOLVED` / `PARTIAL`), then check them against the `REVIEW_SUMMARY` line. If the JSON won't parse, the summary line is missing/malformed, or the recomputed counts disagree with the summary, re-invoke the reviewer once to conform; if it still fails, switch reviewer or escalate. Do **not** proceed on mismatched or guessed counts.

For each **NEW / UNRESOLVED / PARTIAL** finding, you (the host) decide — this is where you are the judge of the argument, not a stenographer:

- **APPLY** — you agree it's a real problem. Make the fix now (edit the plan doc, or edit the source). One logical fix at a time; keep them small and attributable.
- **REJECT** — you judge it wrong, out of scope, or already handled. You **must** write a specific rebuttal in the ledger ("rejected because …"). **Never silently dismiss a finding** — every finding ends as either an applied fix or a recorded rebuttal.

**Disputed blockers** (you want to REJECT a BLOCKER):
- Default: **pause and ask the user to rule** (AskUserQuestion — present the finding, your rebuttal, and let them uphold your rejection or override to apply). The user's ruling is binding and recorded.
- With `--auto`: do **not** pause — record your rebuttal, uphold the rejection, and continue. The standoff is logged for the user to see at the end.

**Anti-sycophancy discipline** (LLM reviewers cave under push-back and rubber-stamp fixes):
- Carry rebuttals **neutrally** as the author's reasoning for the reviewer to evaluate — never with authoritative/citation framing ("according to X, this is fine"), which is exactly what makes reviewers regress (arXiv:2509.16533).
- Never ask the reviewer to "confirm these fixes are good." Always re-review adversarially against the current target ("verify each, find what's still broken") — reviewers asked to confirm agree even when wrong (arXiv:2510.11822). The re-review round *is* the verification.
- Reject findings on their merits, not because they're inconvenient — the different-model reviewer is your defense against your own blind spots.

Append every decision to `ledger.md`: round, finding id, severity, decision (APPLY/REJECT/ESCALATED→ruling), and the fix summary or rebuttal.

## Step 3 — Carry context forward

Keep the context passed to the next round **compact** (a Reflexion-style buffer, not the full transcript — bounds cost and avoids context bloat). Carry only:
1. **Pending finding records** — for each finding the host acted on, a compact record: `id`, `severity`, `location`, the original `claim`, the host action (APPLY/REJECT), and the one-line fix summary or rebuttal. Carrying the original claim + location (not just "what changed") lets the reviewer verify against the *defect* itself, not the host's description of its fix. Present rebuttals neutrally (see anti-sycophancy above). Drop a record once the reviewer marks it RESOLVED or CONCEDED.
2. The **current** target state (re-capture the diff for code targets; the reviewer reads the current files itself).

Do **not** carry resolved findings or the reviewer's full prose from prior rounds.

## Step 4 — Termination

The **gate metric** = the gating findings the **reviewer left open in its latest output** — unresolved BLOCKERs (+ unresolved HIGH unless `--only-blockers`), counting only findings the reviewer marked `NEW` / `UNRESOLVED` / `PARTIAL`. **Do not subtract fixes you applied this round**: an applied fix is *pending verification*, not resolved, until a later reviewer round confirms it. (This is the guard against false convergence — the host cannot declare success on its own unverified edits.)

After each round:

- **CONVERGED** — a reviewer round verified the prior fixes and left the gate metric at **0** (no open gating findings, nothing newly raised). If you applied or upheld-rejected any gating finding *this* round, you are **not** yet converged — run one more round so the reviewer can verify those. ✅ Stop, report success. Surface any remaining MEDIUM (and HIGH if `--only-blockers`) as a non-blocking punch list.
- **DRY** — two consecutive rounds produce **no new findings** (only re-raising already-resolved or already-rejected items). Stop; the loop has wrung out what it can. Report remaining gating items as a standoff for the user.
- **STALLED** — the **same gating finding identities** persist across consecutive rounds with no applied fix, accepted rebuttal, or reviewer concession against them (use finding identity, not raw count — a round that resolves two blockers and discovers two new ones is *progress*, not a stall). The host is stuck on those specific items. Escalate.
- **MAX ROUNDS** — `round == --max-rounds` and the gate isn't met. Escalate.

Show progress before each round: `Round N/MAX — <B> blockers, <H> high, <M> medium unresolved`.

**Escalation gate** (STALLED / MAX / DRY-with-remaining): present the user (AskUserQuestion) with the remaining gating findings and offer:
- **Proceed anyway** — accept the work with the listed findings outstanding (records the acceptance).
- **Run more rounds** — raise the cap and continue.
- **Take it manually** — hand back with the ledger so the user resolves the rest by hand.

Under `--auto`, don't prompt: stop at the cap or on stall/dry, and report the outcome with the full ledger.

## Step 5 — Report

Summarize: the verdict (converged / escalated / stopped), rounds run, reviewer(s) used, counts resolved vs. outstanding by severity, and the path to `ledger.md`. For a plan target, the doc is edited in place (and, if it lives under `~/ai-plans/`, committed per the user's plan-doc rules — stage only the touched files). For a code target, the working tree holds the applied fixes; do not commit unless the user asks.

## Evidence & references

The rules above target known failure modes of LLM cross-review: self-review without an external critic degrades, so the reviewer is always a different model *family*; reviewers cave under push-back and rubber-stamp fixes, so rebuttals are carried neutrally and re-review is always adversarial (never "confirm") with the host never counting its own unverified fixes toward convergence; and review loops drift or blow up cost, so rounds are capped with identity-based stall/dry detection and a compact carried buffer (single reviewer by default). Evidence: arXiv:2310.01798, 2509.16533, 2510.11822, 2305.14325 (2–3 rounds capture most gains, >4 can degrade), 2303.11366, 2310.18679.

Runner invocation syntax and the mandatory sandbox bypass come from the matching `*-runner` skills (`codex-runner`, `cursor-runner`, `opencode-runner`, `pi-runner`, `copilot-runner`, `claude-runner`); the `REVIEW_SUMMARY` contract, stall detection, and escalation gate are adapted from GSD's `gsd-plan-review-convergence`.
