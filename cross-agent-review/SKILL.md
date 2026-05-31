---
name: cross-agent-review
description: Converge a plan or code change through multiple rounds of adversarial review by an external coding agent (e.g. Claude asks Codex). The reviewer returns blocker/high/medium findings; the host validates each, applies fixes or records a rebuttal, then re-invokes the reviewer with carried-forward context. Loops until no blockers (and no high) remain or a max round cap is hit.
---

# cross-agent-review

Drive a target — a **plan document** or a **code change** — to convergence through repeated adversarial review by a *different* coding agent than the one running this skill.

The agent running this skill is the **host** (the primary/receiving agent). The host holds the work, applies fixes, and acts as judge. A separate external CLI (Codex, Cursor, Gemini, opencode, Copilot, Pi) is the **reviewer**: it never edits, it only critiques. Using a different model family for the reviewer is the whole point — an external critic catches what self-review cannot (self-review without external feedback tends to degrade, not improve; arXiv:2310.01798).

The loop:

```
host prepares target + carried context
  └─► reviewer critiques  (blocker / high / medium findings, structured)
        └─► host validates each finding: APPLY a fix, or REJECT with a written rebuttal
              └─► re-invoke reviewer with carried context (fixes made + upheld rebuttals)
                    └─► repeat until gate met (no blockers, and no high by default)
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
- `--branch <name>` → that branch's diff against the default branch.
- *(omitted / `--working-tree`)* → the current uncommitted working tree (staged + unstaged) → fixes are edits to source.
- a free-text description in quotes → treated as the plan to review (host writes it to the scratch dir first).

**Options:**
| Flag | Default | Meaning |
|---|---|---|
| `--reviewer <name>` | auto (cross-vendor) | Force the reviewer CLI: `codex`, `cursor`, `gemini`, `opencode`, `copilot`, `pi`. |
| `--panel [a,b,c]` | off (single) | Run a multi-reviewer panel each round instead of one reviewer. With no list, picks up to 3 available non-host CLIs. |
| `--max-rounds N` | `3` | Hard cap on review rounds. |
| `--only-blockers` | off | Gate convergence on **blockers only**; high/medium are reported but never keep the loop running. (Default gate is **blockers + high**.) |
| `--auto` | off | Fully autonomous: never pause to ask the user. Disputed blockers are rejected with a recorded rebuttal and the loop continues. (Default: pause and ask the user to rule on any disputed **blocker**.) |
| `--scratch <dir>` | `.cross-agent-review/<slug>/` | Where round artifacts are written. |

## Step 0 — Set up

1. **Resolve the target** and its kind (`plan-doc` | `code`). For `code`, capture the diff once up front (`git diff <base>...HEAD` or working-tree diff) and note which files are in scope.
2. **Pick the reviewer(s).** The reviewer **must be a different model family than the host.** Detect the host from the environment (these are set by the host CLI, not by you):
   - `CLAUDE_CODE_ENTRYPOINT` set → host is Claude → **default reviewer: `codex`**.
   - `CURSOR_SESSION_ID` set → host is Cursor → default reviewer: `codex`.
   - Codex/Gemini/other host → default reviewer: `codex` if host isn't Codex, else `cursor`.
   - Always **self-skip the host CLI** so an agent never reviews its own family. Honor `--reviewer` / `--panel` over the default, but still refuse to use the host as a reviewer (warn and pick another).
   - Confirm the chosen reviewer CLI is installed (`<cli> --help`); if not, fall back to the next available non-host CLI and tell the user which you picked.
3. **Create the scratch dir** (`--scratch` or `.cross-agent-review/<slug>/`). Tell the user the path and that it can be git-ignored. Initialize `ledger.md` (the running audit trail).
4. **Announce the plan**: target, reviewer(s), gate (`blockers+high` or `--only-blockers`), max rounds, dispute mode (`escalate` or `--auto`).

## Step 1 — Reviewer invocation (per round)

Reviewers run **read-only** and you call their CLI via Bash. Every such Bash call **MUST set `dangerouslyDisableSandbox: true`** — these CLIs hit the network and local sockets, so the first sandboxed attempt always fails (see the `codex-runner` / `cursor-runner` / etc. skills). Set the bypass on the very first call.

Write the round's request to `round-<N>-request.md` in the scratch dir, then point the reviewer at it. The request file contains, in this order:

1. **Role & rules** (the adversarial contract — see below).
2. **What to review**: for a plan, the plan path + inline contents; for code, the diff plus the list of changed files (instruct the reviewer to also open the surrounding files for cross-module context — diff-only review misses systemic issues).
3. **Carried context** (rounds ≥ 2 only): the *fixes applied so far* (one line each) and the *findings the host rejected* with the host's rebuttal (so the reviewer doesn't blindly re-raise them — but may concede or strengthen its case).
4. **Output contract** (the structured format below).

Canonical read-only invocations (adapt flags from the matching runner skill; pass the request via stdin or file, capture the final message):

```bash
# Codex (default reviewer)
codex exec --sandbox read-only --json --output-last-message <scratch>/round-<N>-findings.txt - < <scratch>/round-<N>-request.md
# Cursor — read-only ask mode
agent -p --mode ask --output-format json "Read <scratch>/round-<N>-request.md and follow it." 
# opencode
opencode run --format json "Read <scratch>/round-<N>-request.md and follow it."
# Gemini / Copilot / Pi — read-only equivalents (see the runner skills; Pi: --tools read,grep,find,ls)
```

In **panel** mode, invoke each reviewer the same way (they may run in parallel via separate backgrounded Bash calls). After collecting all panel findings, **dedupe** near-identical findings and **promote** any finding independently raised by ≥2 reviewers up one severity level (an ensemble-confidence signal; N-CRITICS, arXiv:2310.18679).

### The adversarial contract (put this in the request file)

> You are an adversarial reviewer. Treat the work as broken until proven otherwise — your job is to find what's wrong, not to praise it. Do **not** rubber-stamp. If you genuinely find nothing of a given severity, say so explicitly rather than inventing nitpicks.
>
> Classify every finding as exactly one of:
> - **BLOCKER** — a correctness, security, data-loss, or spec-violation defect that makes this unacceptable as-is.
> - **HIGH** — a likely bug, missing error handling, unhandled edge case, or significant risk/gap that should be fixed.
> - **MEDIUM** — a real maintainability/quality/edge-case improvement worth making. Do **not** emit pure style/formatting nits; fold trivial points into MEDIUM only if they carry real risk, otherwise omit them.
>
> For each finding give: a short `id`, `severity`, `location` (file:line or section), `claim` (what's wrong), `why` (impact), and `suggested_fix`.
>
> **On a re-review round**, for every prior finding listed in the carried context, first report its `status` as `RESOLVED` (the change correctly fixes it), `PARTIAL` (attempted but incomplete/incorrect — explain), or `UNRESOLVED`. Do **not** assume a fix is correct because it was attempted — verify it against the actual current code/plan. Then add any newly discovered findings. For findings the author rejected with a rebuttal: independently judge whether each is genuinely a non-issue — concede it if the rebuttal holds, or restate it with a stronger, specific argument if it does not.
>
> End your response with one machine-readable line, exactly:
>
> `REVIEW_SUMMARY: blockers=<N> high=<M> medium=<K>`
>
> where the counts are findings that **remain unresolved** after this round (exclude anything you marked RESOLVED and anything you conceded). Immediately before it, output a fenced ```json block containing the array of all findings with their fields and (on re-review) statuses.

## Step 2 — Host validates the findings (the push-back gate)

Parse the `REVIEW_SUMMARY` line and the JSON findings block from the reviewer's output. **Verify the contract** — if the summary line is missing or malformed, or the JSON won't parse, re-invoke the reviewer once asking it to conform; if it fails again, switch reviewer or escalate. Do **not** guess the counts.

For each **new or UNRESOLVED/PARTIAL** finding, you (the host) decide — this is where you are the judge of the argument, not a stenographer:

- **APPLY** — you agree it's a real problem. Make the fix now (edit the plan doc, or edit the source). One logical fix at a time; keep them small and attributable.
- **REJECT** — you judge it wrong, out of scope, or already handled. You **must** write a specific rebuttal in the ledger ("rejected because …"). **Never silently dismiss a finding** — every finding ends as either an applied fix or a recorded rebuttal.

**Disputed blockers** (you want to REJECT a BLOCKER):
- Default: **pause and ask the user to rule** (use AskUserQuestion — present the finding, your rebuttal, and let them uphold your rejection or override to apply). The user's ruling is binding and recorded.
- With `--auto`: do **not** pause — record your rebuttal, uphold the rejection, and continue. The standoff is logged for the user to see at the end.

**Anti-sycophancy discipline** (this matters — LLM reviewers cave under push-back and rubber-stamp fixes):
- When you carry a rebuttal forward, present it **neutrally** as the author's reasoning for the reviewer to independently evaluate — do **not** dress it up with authoritative/citation framing ("according to X, this is fine"), which is exactly what makes reviewers regress (arXiv:2509.16533).
- Never tell the reviewer "confirm these fixes are good." Always re-review adversarially ("verify each against the current code; find what's still broken") — reviewers asked to confirm will agree even when wrong (agreeableness bias, TNR <25%, arXiv:2510.11822). The re-review round *is* the verification.
- Reject findings on their merits, not because they're inconvenient. The reviewer being a different model is your defense against your own blind spots — take it seriously.

Append every decision to `ledger.md`: round number, finding id, severity, decision (APPLY/REJECT/ESCALATED→ruling), and the fix summary or rebuttal.

## Step 3 — Carry context forward

Keep the context passed to the next round **compact** (a Reflexion-style buffer, not the full transcript — bounds cost and avoids context bloat). Carry only:
1. **Fixes applied this round** — one line each (finding id → what changed).
2. **Upheld rejections** — finding id + the rebuttal, so the reviewer can re-judge but won't blindly re-raise.
3. The **current** target state (re-capture the diff for code targets; the reviewer reads the current files itself).

Do **not** carry resolved findings or the reviewer's full prose from prior rounds.

## Step 4 — Termination

After each round, compute the **gate metric** = unresolved BLOCKERs (+ unresolved HIGH unless `--only-blockers`), using the reviewer's verified statuses minus this round's applied fixes minus upheld rejections. Then:

- **CONVERGED** — a review round reports a gate metric of **0** (the reviewer verified the prior fixes and raised no new gating findings). ✅ Stop, report success. Surface any remaining MEDIUM (and HIGH if `--only-blockers`) as a non-blocking punch list.
- **DRY** — two consecutive rounds produce **no new findings** (only re-raising already-resolved or already-rejected items). Stop; the loop has wrung out what it can. Report remaining gating items as a standoff for the user.
- **STALLED** — the gate metric did **not decrease** versus the previous round (and isn't 0). The host is stuck — further rounds won't help. Escalate to the user.
- **MAX ROUNDS** — `round == --max-rounds` and the gate isn't met. Escalate.

Show progress before each round: `Round N/MAX — <B> blockers, <H> high, <M> medium unresolved`.

**Escalation gate** (STALLED / MAX / DRY-with-remaining): present the user (AskUserQuestion) with the remaining gating findings and offer:
- **Proceed anyway** — accept the work with the listed findings outstanding (records the acceptance).
- **Run more rounds** — raise the cap and continue.
- **Take it manually** — hand back with the ledger so the user resolves the rest by hand.

Under `--auto`, don't prompt: stop at the cap or on stall/dry, and report the outcome with the full ledger.

## Step 5 — Report

Summarize: the verdict (converged / escalated / stopped), rounds run, reviewer(s) used, counts resolved vs. outstanding by severity, and the path to `ledger.md`. For a plan target, the doc is edited in place (and, if it lives under `~/ai-plans/`, committed per the user's plan-doc rules — stage only the touched files). For a code target, the working tree holds the applied fixes; do not commit unless the user asks.

## Failure modes this design defends against (and the evidence)

- **Self-review degrades** → reviewer is always a *different* model family (arXiv:2310.01798).
- **Reviewer invents nitpicks / false positives kill trust** → named severities, "no style nits", host's reject gate, MEDIUM never gates (arXiv:2603.00539).
- **Reviewer caves when you push back** → neutral rebuttal framing, no authoritative/citation framing (arXiv:2509.16533).
- **Reviewer rubber-stamps fixes** → re-review adversarially, never "confirm" (arXiv:2510.11822).
- **Infinite loop / oscillation / drift** → hard round cap + stall + dry detection; literature finds 2–3 rounds capture most gains and >4 can degrade (multi-agent debate, arXiv:2305.14325).
- **Cost / context blowup** → single reviewer by default, compact carried buffer (Reflexion, arXiv:2303.11366).
- **Silent dismissal of valid findings** → fix-or-argue ledger; disputed blockers escalate to the user by default.

## Verification sources

Built from: the runner skills in this repo (`codex-runner`, `cursor-runner`, `opencode-runner`, `pi-runner`, `copilot-runner`, `claude-runner`) for invocation syntax and the mandatory sandbox bypass; GSD's `gsd-plan-review-convergence` for the `REVIEW_SUMMARY`-style machine-readable contract, stall detection, and escalation gate; and the research cited inline (Self-Refine 2303.17651, Reflexion 2303.11366, multi-agent debate 2305.14325, N-CRITICS 2310.18679, self-correction limits 2310.01798, rebuttal sycophancy 2509.16533, agreeableness bias 2510.11822, reviewer overcorrection 2603.00539).
