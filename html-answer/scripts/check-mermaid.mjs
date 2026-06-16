#!/usr/bin/env node
// Syntax-check Mermaid diagrams using the mermaid library's parser (no mmdc,
// no headless Chrome). mermaid.parse() validates grammar without rendering;
// a jsdom shim is required because some diagram types (state, class, er, ...)
// touch DOMPurify during parse and would otherwise throw spuriously.
//
// Usage:
//   node check-mermaid.mjs <file.html> [more.html ...]   # extract & check .mermaid blocks
//   node check-mermaid.mjs --raw <file.mmd> [...]         # check whole files as diagrams
//   cat diagram.mmd | node check-mermaid.mjs -            # check stdin as one diagram
//
// Exit code 0 if every diagram parses, 1 if any fails (or no diagrams found
// when files were given).

import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

// --- DOM shim (must be set up before importing mermaid) --------------------
const dom = new JSDOM("<!DOCTYPE html><body></body>", { pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.navigator ??= dom.window.navigator;

const mermaid = (await import("mermaid")).default;
mermaid.initialize({ startOnLoad: false });

// --- HTML extraction -------------------------------------------------------

// Match <pre class="...mermaid...">…</pre> and the <div> equivalent, with the
// class in single or double quotes and other classes alongside.
const BLOCK_RE =
  /<(pre|div)\b[^>]*\bclass\s*=\s*["'][^"']*\bmermaid\b[^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi;

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&amp;/g, "&"); // last, so &amp;lt; -> &lt; isn't double-decoded
}

function extractFromHtml(html) {
  const blocks = [];
  for (const m of html.matchAll(BLOCK_RE)) {
    blocks.push(decodeEntities(m[2]).trim());
  }
  return blocks;
}

// --- diagram checking ------------------------------------------------------

async function checkDiagram(text) {
  try {
    await mermaid.parse(text);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (buf += c));
    process.stdin.on("end", () => resolve(buf));
    process.stdin.on("error", reject);
  });
}

function indent(s, pad = "    ") {
  return s.split("\n").map((l) => pad + l).join("\n");
}

// --- main ------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const raw = args.includes("--raw");
  const files = args.filter((a) => a !== "--raw");

  if (files.length === 0) {
    process.stderr.write(
      "usage: check-mermaid.mjs <file.html ...> | --raw <file.mmd ...> | -\n",
    );
    process.exit(2);
  }

  let total = 0;
  let failed = 0;

  for (const file of files) {
    const isStdin = file === "-";
    let content;
    try {
      content = isStdin ? await readStdin() : await readFile(file, "utf8");
    } catch (e) {
      console.error(`✗ ${file}: cannot read (${e.message})`);
      failed++;
      continue;
    }

    const label = isStdin ? "<stdin>" : file;
    const looksHtml = !raw && !isStdin && /\.html?$/i.test(file);
    const diagrams =
      looksHtml ? extractFromHtml(content) : [content.trim()];

    if (looksHtml && diagrams.length === 0) {
      console.log(`• ${label}: no mermaid blocks found`);
      continue;
    }

    for (let i = 0; i < diagrams.length; i++) {
      total++;
      const where = diagrams.length > 1 ? `${label} [block ${i + 1}]` : label;
      const res = await checkDiagram(diagrams[i]);
      if (res.ok) {
        console.log(`✓ ${where}`);
      } else {
        failed++;
        console.log(`✗ ${where}`);
        console.log(indent(res.error));
        console.log(indent("--- diagram source ---", "  "));
        console.log(indent(diagrams[i], "  "));
      }
    }
  }

  console.log(`\n${total - failed}/${total} diagram(s) OK`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
