# Interactive Mode Protocol

Serve the generated HTML answer through the bundled Next.js server so the
reader can highlight text, ask questions, **continue the conversation with
follow-ups**, and receive AI answers as Tufte margin notes. The questions are
answered by **this Claude session** — the one that generated the document — so
answers carry full conversation context.

Two things make this a living document rather than a one-shot Q&A:

- **Threaded conversation.** Each highlight owns a *thread*. After the first
  answer, the reader can click "Ask a follow-up" in the note and keep asking
  about the same passage. Each follow-up arrives as another question event,
  carrying the prior turns of that thread as `history` so your answer stays in
  context.
- **Updates persist; comments don't disappear.** The reader (or the user in
  chat) can ask you to revise the answer. You **regenerate the same
  `/tmp/<answer>.html` file**; the server re-reads it on every request, so a
  browser reload shows the new content. The annotations are **not** removed on
  reload — the annotator re-anchors every existing thread by its quoted text
  and re-renders it in place. So: edit the file → reader reloads → updated page,
  same comments.

All Q&A state is **ephemeral** (in-memory in the server process). Stopping the
server discards questions and answers. The static HTML file is only ever
changed when *you* rewrite it to honor an update request — the server never
mutates it.

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
     `id` (the **thread** id), `number`, `quote` (highlighted text),
     `prefix`/`suffix` (surrounding text), `heading` (nearest section
     heading), `question` (the newly asked text), `isFollowup` (true when this
     continues an existing thread), and `history` (prior `{question,
     answerHtml}` turns of this thread).

     When `isFollowup` is true, read `history` so your answer continues the
     conversation rather than restarting it.

     Compose a **margin-note-sized** answer: 1–3 short paragraphs, grounded
     in the document and the conversation that produced it. Format as a small
     HTML fragment (`<p>…</p>`, inline `<code>`, `<a>` links — no headings,
     no scripts). Post it (the `id` is the thread id; the server attaches the
     answer to the turn just delivered):
     ```bash
     curl -fsS -X POST http://localhost:4787/api/answers \
       -H 'content-type: application/json' \
       -d '{"id":"<thread id>","answerHtml":"<p>…</p>"}'
     ```
     Mention in chat (one line) which question you answered, then **restart
     the waiter** (step 5) and continue.
   - `{"type":"server-gone"}` (exit 1) — the server died. Report it to the
     user; restart the server if they want to continue.

7. **Handling page-update requests.** If the user (in chat) or a reader asks
   for the answer document to be changed — add a section, fix an error, expand
   a diagram — **rewrite the same `/tmp/<answer>.html` file** per SKILL.md. Do
   not start a new server or change the port. Tell the user to reload the
   page. The new content appears and **all existing comments are preserved**:
   the annotator re-anchors each thread by its quoted text. If a comment's
   quoted passage was removed or heavily rewritten, that thread is shown as an
   orphaned inline note (flagged "text not found") so it is never silently
   dropped — avoid rewording quoted passages when you can keep them.

8. **Ending the session.** When the user says they are done (or wants the
   static file instead): stop the waiter background task, kill the server
   process, and confirm. Remind the user the annotations were ephemeral.

Questions queue FIFO server-side: if several arrive while you answer one, the
restarted waiter returns the next immediately (including follow-ups). The page
shows queued questions as pending highlights.

## API reference

| Endpoint | Method | Body / params | Purpose |
|---|---|---|---|
| `/` | GET | — | Serve `HTML_FILE` with annotator injected |
| `/api/questions` | POST | `{id, quote, prefix, suffix, heading?, question}` (new thread) or `{id, question}` (follow-up on existing thread) | UI submits a question |
| `/api/questions` | GET | — | Full state as `{threads:[{id,number,quote,prefix,suffix,heading,exchanges:[{question,answerHtml,status}]}]}` (UI polls every 1.5s and re-anchors on reload) |
| `/api/questions/wait` | GET | `?timeoutMs=50000` | Long-poll; `{type:"question",question}` (with `isFollowup`+`history`) or `{type:"timeout"}` |
| `/api/answers` | POST | `{id, answerHtml}` | Post the answer (id = thread id; attaches to the delivered turn) |

## Troubleshooting

- **Server won't start / port in use** — stale `next dev` from an earlier
  session. `lsof -nP -iTCP:<port> -sTCP:LISTEN` and kill the PID, or switch port.
- **Waiter exited but you saw no question** — read the background task's
  output file; the JSON is its last line.
- **Page loads without the Ask-AI affordance** — the document lacked a
  `</body>` tag, or `annotator.js` 404'd; check the server log.
- **Answer posted but note still says "Asking Claude…"** — verify the POST
  used the exact `id` from the question JSON; check `GET /api/questions`.
