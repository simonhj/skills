---
name: pr-explainer
description: "Trigger: pr explainer, pr-explainer, explain this PR, end-to-end PR explanation, PR explainer page. Build a standalone HTML explainer of a pull request using the html-answer skill: narrate the PR's flow end to end, cite every non-test code change, and finish with a JavaScript multiple-choice quiz whose answer order is shuffled on each page load."
license: Apache-2.0
metadata:
  version: "1.0"
---

## Activation Contract

Use when the user wants a pull request explained end to end as a rendered document. Triggers: `/pr-explainer`, "explain this PR", "build an explainer for PR #N", "PR explainer".

Do not use for reviewing a PR (use `pr-triple-review`), for a D3 visualization (use `pr-walkthrough`), or for writing a PR description (use `write-pr-description`).

## Hard Rules

1. **The output is an html-answer page.** Locate the `html-answer` skill among the available skills, read its SKILL.md in full, and follow every requirement in it (standalone file in `/tmp`, Tufte design, sidebar TOC, Mermaid with the bundled syntax checker, Highlight.js from a full CDN bundle).
2. **Explain the flow, not the diff.** Organize the walkthrough by how the change works end to end — entry point, through each transformation, to its observable effect — never file-by-file in diff order.
3. **Cite non-test code exhaustively.** Every non-test hunk in the diff must appear as a code block in the explainer. Run the coverage check (Step 5) before finishing; do not skip it.
4. **Read beyond the diff.** Open the full post-PR version of each changed file, plus key callers and callees, so the narrative explains how the new code fits into the existing system — not just what the lines say.
5. **End with a quiz.** 1–10 multiple-choice questions scaled to PR size, rendered entirely by JavaScript from a question array, with answer order shuffled on every page load. Implement it per [references/quiz.md](references/quiz.md).

## Step 1 — Identify the PR

Source the PR from the conversation, in this order:

1. **Argument**: the user passed a number or URL (`/pr-explainer 42` or a full PR URL).
2. **Conversation context**: a PR discussed or created earlier in this session.
3. **Current branch**: `gh pr view --json number,url,title` from the repo checkout.
4. **Nothing evident**: ask the user for the PR number or URL (one question, then stop and wait).

## Step 2 — Gather context

```bash
gh pr view <N> --json title,body,url,number,baseRefName,headRefName,additions,deletions,files,commits
gh pr diff <N>          # the full diff — source of truth for coverage
```

Then read the **post-PR version in full** of every changed non-test file (from the local checkout at the head ref, or `gh api repos/{owner}/{repo}/contents/<path>?ref=<headRef>`). Also read the immediate callers of new/changed functions and any config or schema the change depends on. You need enough context to answer "what happens, in order, when this code path runs" — the diff alone cannot tell you that.

## Step 3 — Classify the changed files

| Category | Treatment |
|----------|-----------|
| Non-test code | Must all be cited in the explainer (Hard Rule 3) |
| Tests | Summarize what behavior they lock in; cite only the ones that best illustrate the new behavior |
| Generated files, lockfiles, vendored code | Mention in one line; do not cite |

## Step 4 — Write the explainer

Recommended section structure (adapt to the PR, keep the order of ideas):

1. **Why this PR exists** — the problem, from the PR body, linked issues, and commit messages. Link to the PR.
2. **The change at a glance** — a short table of changed files by role, plus a Mermaid diagram of the components involved and how data or control flows between them after the change.
3. **End-to-end walkthrough** — the core of the document, usually several sections. Follow the execution or data flow: start where the code path is entered, walk each step in the order it runs, and show the relevant code at each step. Explain how each piece connects to the next and to pre-existing code. Sequence or flowchart diagrams help wherever the flow branches or crosses component boundaries.
4. **Edge cases and error handling** — what the PR does when things go wrong, if applicable.
5. **Tests** — what the tests pin down, per Step 3.
6. **Other changes** — mechanical edits (renames, moved imports, signature threading) grouped compactly. This section exists so coverage can be exhaustive without bloating the walkthrough; cite these hunks in grouped code blocks with one line of context each.
7. **Quiz** — Step 6.

Code citation format: precede every code block with the file path and the block's role in the flow. Show the **post-PR state** of the code; quote short "before" excerpts only where the contrast is the point. Annotate non-obvious lines with brief comments or margin notes.

## Step 5 — Coverage check

Before adding the quiz, verify Hard Rule 3 mechanically:

1. From `gh pr diff <N>`, list every non-test file and its hunks.
2. For each hunk, confirm the added/changed lines appear in a code block in the draft (verbatim or lightly truncated with `// ...` for repetitive runs).
3. Anything missing goes into the walkthrough if it is part of the flow, or into "Other changes" if mechanical.

Do not finish with uncited non-test hunks.

## Step 6 — Build the quiz

Scale the question count to the PR's non-test changed lines:

| Non-test changed lines | Questions |
|------------------------|-----------|
| < 50 | 1–2 |
| 50–150 | 3–4 |
| 150–400 | 5–6 |
| 400–1000 | 7–8 |
| > 1000 | 9–10 |

Question quality rules:

- Test comprehension of the flow and the rationale: "what happens when…", "why does X do Y…", "what would break if…". Never trivia (file names, line counts, who authored it).
- Exactly one correct answer per question, 3–5 options total.
- Distractors must be plausible — statements a reader who only skimmed the diff might believe.
- Every question carries a one-sentence explanation and an anchor link to the section that answers it.

Implement with the template in [references/quiz.md](references/quiz.md): questions live in a JS array, the DOM is built entirely by JavaScript at load time, and each question's answer order is shuffled with Fisher–Yates on every page load. Answering gives immediate right/wrong feedback plus the explanation; a score line appears once all questions are answered.

## Step 7 — Validate and deliver

1. Run the html-answer skill's Mermaid checker on the generated file; fix and re-run until it exits 0.
2. Reload-test the quiz mentally against the template: shuffled order, one click disables the question, score appears at the end.
3. Name the file `/tmp/pr-<number>-explainer.html` (prefix with the repo name if several repos are in play).
4. Open the file, then report: the absolute path, a one-sentence summary of the explainer, and the question count.

## Output Contract

- The absolute path to the generated HTML file.
- One sentence on what the explainer covers.
- The number of quiz questions.
- Confirmation that all non-test hunks are cited (or the explicit list of exclusions, e.g. generated files).
