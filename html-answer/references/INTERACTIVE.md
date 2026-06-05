# Interactive Mode Protocol

Serve the generated HTML answer through the bundled Next.js server so the
reader can highlight text, ask questions, and receive AI answers as Tufte
margin notes. The questions are answered by **this Claude session** — the one
that generated the document — so answers carry full conversation context.

All state is **ephemeral** (in-memory in the server process). Stopping the
server discards questions and answers; the static HTML file is never modified.

## Components

- `scripts/server/` — Next.js app. Serves the HTML file (injecting
  `annotator.js`/`annotator.css` at serve time) and exposes the Q&A API.
- `scripts/wait-for-question.sh <port>` — long-polls the server; **exits
  printing the question JSON** when a question arrives. Run it in the
  background: when it exits, the harness re-invokes you with its output.

## Sandbox note

`npm install`, starting the server (port bind), and curl to localhost are all
blocked by the Bash sandbox — run those commands with
`dangerouslyDisableSandbox: true`.

## Protocol

1. **Generate the HTML** in `/tmp` exactly per SKILL.md. Do NOT inject any
   annotator code yourself — the server does that at serve time. Do NOT
   `open` the file directly in interactive mode.

2. **Install dependencies (first run only).** If
   `scripts/server/node_modules` is missing:
   ```bash
   cd <skill-dir>/scripts/server && npm install
   ```

3. **Pick a port.** Default `4787`. If something is already listening
   (`lsof -nP -iTCP:4787 -sTCP:LISTEN`), it is probably a stale server from a
   previous session — kill it, or use 4788/4789.

4. **Start the server** as a background Bash command (`run_in_background`):
   ```bash
   cd <skill-dir>/scripts/server && HTML_FILE=/tmp/<answer>.html npx next dev -p 4787
   ```
   Wait for readiness by polling `curl -fsS -o /dev/null http://localhost:4787/`
   (a few seconds), then `open http://localhost:4787`.

5. **Start the waiter** as a separate background Bash command:
   ```bash
   <skill-dir>/scripts/wait-for-question.sh 4787
   ```
   Then tell the user interactive mode is live and continue normally — the
   terminal stays usable for regular chat.

6. **When the waiter exits**, its output is one of:
   - `{"type":"question","question":{...}}` — a reader question. Fields:
     `id`, `number`, `quote` (highlighted text), `prefix`/`suffix`
     (surrounding text), `heading` (nearest section heading), `question`.

     Compose a **margin-note-sized** answer: 1–3 short paragraphs, grounded
     in the document and the conversation that produced it. Format as a small
     HTML fragment (`<p>…</p>`, inline `<code>`, `<a>` links — no headings,
     no scripts). Post it:
     ```bash
     curl -fsS -X POST http://localhost:4787/api/answers \
       -H 'content-type: application/json' \
       -d '{"id":"<question id>","answerHtml":"<p>…</p>"}'
     ```
     Mention in chat (one line) which question you answered, then **restart
     the waiter** (step 5) and continue.
   - `{"type":"server-gone"}` (exit 1) — the server died. Report it to the
     user; restart the server if they want to continue.

7. **Ending the session.** When the user says they are done (or wants the
   static file instead): stop the waiter background task, kill the server
   process, and confirm. Remind the user the annotations were ephemeral.

Questions queue FIFO server-side: if several arrive while you answer one, the
restarted waiter returns the next immediately. The page shows queued
questions as pending highlights.

## API reference

| Endpoint | Method | Body / params | Purpose |
|---|---|---|---|
| `/` | GET | — | Serve `HTML_FILE` with annotator injected |
| `/api/questions` | POST | `{id, quote, prefix, suffix, heading?, question}` | UI submits a question |
| `/api/questions` | GET | — | Full Q&A state (UI polls every 1.5s) |
| `/api/questions/wait` | GET | `?timeoutMs=50000` | Long-poll; `{type:"question",question}` or `{type:"timeout"}` |
| `/api/answers` | POST | `{id, answerHtml}` | Post the answer |

## Troubleshooting

- **Server won't start / port in use** — stale `next dev` from an earlier
  session. `lsof -nP -iTCP:<port> -sTCP:LISTEN` and kill the PID, or switch port.
- **Waiter exited but you saw no question** — read the background task's
  output file; the JSON is its last line.
- **Page loads without the Ask-AI affordance** — the document lacked a
  `</body>` tag, or `annotator.js` 404'd; check the server log.
- **Answer posted but note still says "Asking Claude…"** — verify the POST
  used the exact `id` from the question JSON; check `GET /api/questions`.
