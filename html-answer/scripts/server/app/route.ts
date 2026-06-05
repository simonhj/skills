import { readFile } from "node:fs/promises";

export const dynamic = "force-dynamic";

const INJECT =
  '<link rel="stylesheet" href="/annotator.css">' +
  '<script src="/annotator.js" defer></script>';

// Serve the generated answer document with the annotator UI injected.
// The file path comes from HTML_FILE and is re-read on every request, so
// regenerating the document shows up on browser reload.
export async function GET(): Promise<Response> {
  const htmlFile = process.env.HTML_FILE;
  if (!htmlFile) {
    return new Response(
      "HTML_FILE environment variable is not set. Start the server with " +
        "HTML_FILE=/tmp/<answer>.html",
      { status: 404 },
    );
  }
  let html: string;
  try {
    html = await readFile(htmlFile, "utf8");
  } catch {
    return new Response(`Cannot read HTML_FILE: ${htmlFile}`, { status: 404 });
  }
  const injected = html.includes("</body>")
    ? html.replace("</body>", `${INJECT}</body>`)
    : html + INJECT;
  return new Response(injected, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
