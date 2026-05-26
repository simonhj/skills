---
name: html-answer
description: Use when the user wants an answer delivered as a standalone HTML file in /tmp with Tufte-inspired typography, Mermaid diagrams, syntax highlighting, and a sidebar table of contents.
---

# html-answer

Create rich explanatory answers as standalone HTML documents in `/tmp` instead
of replying only in chat.

## When to use

Use this skill when the user asks for an answer, explanation, design, plan,
technical walkthrough, comparison, or concept map that would benefit from a
rendered HTML document.

Especially use it when the answer contains diagrams, code, architecture,
workflows, relationships between contexts, timelines, tradeoff analysis, or
multi-section educational material.

## Instructions

1. Create a standalone `.html` file in `/tmp` and put the full answer there.
2. In the final chat response, provide the absolute path to the generated file
   and a one-sentence summary of what it contains.
3. After creating and verifying the file, open it with `open /tmp/<file>.html`.
4. The HTML file must be self-contained except for CDN imports. Do not require a
   build step, local assets, or package installation.
5. Import all JavaScript libraries from public CDNs.
6. Import all fonts from Google Fonts.

## Page Requirements

The generated page must include:

1. A fixed or sticky sidebar table of contents linking to all major sections.
2. Tufte-inspired visual design: high information density, generous margins,
   restrained color, strong typographic hierarchy, serif body text, sidenotes or
   margin notes where helpful, and minimal decorative chrome.
3. A serif font as the primary body typeface, imported from Google Fonts.
4. Clear typography that explains concepts through headings, definitions,
   callouts, captions, annotations, and cross-links.
5. Hyperlinks between related concepts inside the page, plus external links when
   useful for definitions or related information.
6. Responsive layout that remains usable on desktop and mobile.

## Diagrams

Use Mermaid.js for any content that benefits from diagramming, including but
not limited to:

1. Flowcharts and decision trees.
2. Sequence diagrams.
3. Gantt charts and timelines.
4. Entity, dependency, or relationship diagrams.
5. State machines.
6. Context maps and system architecture.

Diagram requirements:

1. Load Mermaid.js from a CDN.
2. Render diagrams from `<pre class="mermaid">` or `<div class="mermaid">`
   blocks.
3. Add captions or nearby explanatory text for each diagram.
4. For large diagrams, support click-to-zoom. Clicking a diagram **must open it
   filling the entire viewport edge-to-edge** — not a 95vw/95vh inset that
   looks visually similar to the inline diagram. The modal must have an obvious
   close control (button + Escape key + click-outside).
5. Attach zoom handlers **after** Mermaid finishes rendering, not on a
   `setTimeout` heuristic. The reliable pattern is to initialize Mermaid with
   `startOnLoad: false`, then `await mermaid.run({ querySelector: '.mermaid' })`
   inside `DOMContentLoaded`, and only then bind click handlers. A naked
   `setTimeout(..., 600)` will silently fail on slower devices or complex
   diagrams because the SVG hasn't been injected yet when `querySelectorAll`
   runs.
6. Bind the zoom handler to the `.mermaid` container, not to the SVG. Mermaid
   sometimes replaces or restructures the SVG; the container is the stable
   target.
7. To make the zoomed diagram truly fill the screen, the modal content must use
   `width: 100vw; height: 100vh` (not `max-width: 95vw`), and the cloned SVG
   must have its `width`/`height` attributes stripped and CSS-sized to fill its
   container:
   ```css
   .modal-content { width: 100vw; height: 100vh; padding: 2rem; box-sizing: border-box;
                    display: flex; align-items: center; justify-content: center; }
   .modal-content svg { width: 100%; height: 100%; max-width: 100%; max-height: 100%; }
   ```
   ```js
   var clone = svg.cloneNode(true);
   clone.removeAttribute('width');
   clone.removeAttribute('height');
   clone.removeAttribute('style');
   content.appendChild(clone);
   ```
   Without stripping the SVG's inline width/height, it renders at its tiny
   intrinsic size and the "zoom" looks unchanged.
8. Verify zoom by clicking a diagram after generating the file: the diagram
   must visibly grow to fill the viewport. If it looks the same size as
   inline, one of the above steps is missing.
9. Keep diagrams readable by choosing appropriate Mermaid chart types and
   splitting oversized diagrams when clarity would improve.

## Code Blocks

Use Highlight.js for any code in the answer.

Code requirements:

1. Load Highlight.js JavaScript and CSS from a CDN.
2. Load a highlight.js build that **includes language definitions**, not the
   core-only `lib/highlight.min.js`. The core-only build silently produces no
   highlighting when used with `language-*` classes. Use the cdnjs bundle
   (`https://cdnjs.cloudflare.com/ajax/libs/highlight.js/<version>/highlight.min.js`)
   or the cdn-release bundle
   (`https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@<version>/build/highlight.min.js`).
   If you need a language not in the common bundle, load it explicitly as an
   additional script.
3. Add language-specific classes such as `language-js`, `language-python`, or
   `language-bash` whenever the language is known.
4. Escape code content correctly so the HTML remains valid.
5. Prefer concise, annotated code samples over long undifferentiated listings.

## Recommended HTML Skeleton

Use this structure unless the task calls for a different layout:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Answer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/highlight.js@11.11.1/styles/github.min.css">
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
</head>
<body>
  <aside class="toc" aria-label="Table of contents"></aside>
  <main>
    <!-- Answer content -->
  </main>
</body>
</html>
```

## Implementation Notes

1. Initialize Mermaid with a restrained theme that fits the page design.
2. Initialize Highlight.js after the document loads. After generating the file,
   verify that `hljs` is defined at runtime and that calling
   `hljs.highlightElement(...)` on a known-language code block produces colored
   `<span>` tags inside it. The easiest sanity check: open the file in a browser
   and confirm at least one `<pre><code>` block has rainbow tokens (not flat
   monospace). If highlighting is silently off, the CDN URL is almost certainly
   the core-only build.
3. Generate the sidebar TOC from headings, or write it manually when that is
   simpler and more reliable.
4. Use semantic HTML: `main`, `section`, `aside`, `figure`, `figcaption`,
   `article`, `nav`, `code`, and `pre` where appropriate.
5. Use stable heading IDs so internal links are predictable.
6. Add a small script for diagram click-to-zoom when Mermaid diagrams are
   present.
7. Verify the file exists in `/tmp` before opening it and responding.
