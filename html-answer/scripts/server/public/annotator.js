// html-answer interactive annotator.
// Injected by the server into the generated answer document. Lets the reader
// highlight text, ask a question, continue the conversation with follow-ups,
// and renders the AI's answers as Tufte margin notes (inline-expandable
// fallback on narrow screens).
//
// Threads are anchored to the document by their quoted text, so they survive a
// page reload: on load we re-find each stored quote and re-attach its note.
// This lets the user ask Claude to regenerate/update the HTML file, reload, and
// keep every existing comment in place.
(() => {
  "use strict";

  const POLL_MS = 1500;
  const MIN_GUTTER = 220; // px of right gutter required for margin notes

  /** id -> { marks, note, aside, sup, thread, orphan, lastRender } */
  const anns = new Map();

  // ---------------------------------------------------------------- UI shell

  const layer = el("div", "ha-notes-layer");
  document.body.appendChild(layer);

  const askBtn = el("button", "ha-ask-btn");
  askBtn.type = "button";
  askBtn.textContent = "Ask AI";
  askBtn.hidden = true;
  document.body.appendChild(askBtn);

  const popover = el("div", "ha-popover");
  popover.hidden = true;
  popover.innerHTML =
    '<textarea class="ha-popover-input" rows="3" ' +
    'placeholder="Ask about the highlighted text…"></textarea>' +
    '<div class="ha-popover-actions">' +
    '<button type="button" class="ha-cancel">Cancel</button>' +
    '<button type="button" class="ha-submit">Ask</button></div>';
  document.body.appendChild(popover);
  const input = popover.querySelector(".ha-popover-input");

  function el(tag, cls) {
    const e = document.createElement(tag);
    e.className = cls;
    return e;
  }

  const inOwnUi = (node) => {
    const e = node.nodeType === 1 ? node : node.parentElement;
    return (
      !!e &&
      !!e.closest(
        ".ha-popover,.ha-ask-btn,.ha-notes-layer,.ha-inline-note,.ha-ref",
      )
    );
  };

  // ------------------------------------------------------------- selection

  let savedRange = null;

  document.addEventListener("mouseup", () => {
    // Defer so the click that dismisses a selection doesn't re-show the button.
    setTimeout(() => {
      const sel = window.getSelection();
      if (
        !sel || sel.isCollapsed || sel.rangeCount === 0 ||
        !sel.toString().trim() ||
        inOwnUi(sel.anchorNode) || inOwnUi(sel.focusNode)
      ) {
        if (popover.hidden) askBtn.hidden = true;
        return;
      }
      savedRange = sel.getRangeAt(0).cloneRange();
      const r = savedRange.getBoundingClientRect();
      askBtn.style.left = `${window.scrollX + r.left + r.width / 2 - 32}px`;
      askBtn.style.top = `${window.scrollY + r.bottom + 6}px`;
      askBtn.hidden = false;
    }, 0);
  });

  // Keep the selection alive when clicking our button.
  askBtn.addEventListener("mousedown", (e) => e.preventDefault());

  askBtn.addEventListener("click", () => {
    askBtn.hidden = true;
    const r = savedRange.getBoundingClientRect();
    popover.style.left =
      `${Math.min(window.scrollX + r.left, window.scrollX + window.innerWidth - 340)}px`;
    popover.style.top = `${window.scrollY + r.bottom + 8}px`;
    popover.hidden = false;
    input.value = "";
    input.focus();
  });

  popover.querySelector(".ha-cancel").addEventListener("click", closePopover);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closePopover();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  });
  popover.querySelector(".ha-submit").addEventListener("click", submit);

  function closePopover() {
    popover.hidden = true;
    askBtn.hidden = true;
  }

  function genId() {
    return `ha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  // ---------------------------------------------------------------- submit

  async function submit() {
    const question = input.value.trim();
    if (!question || !savedRange) return;
    const range = savedRange;
    closePopover();
    window.getSelection()?.removeAllRanges();

    const id = genId();
    const quote = range.toString();
    const { prefix, suffix } = surroundingText(range);
    const heading = nearestHeading(range);
    const marks = wrapRange(range, id);
    if (marks.length === 0) return;

    const { note, aside } = buildNoteElements(id, marks);
    const thread = {
      id,
      number: "?",
      quote,
      prefix,
      suffix,
      heading,
      exchanges: [{ question, status: "queued" }],
    };
    anns.set(id, { marks, note, aside, sup: null, thread, orphan: false, lastRender: "" });
    renderThread(id);
    wireHover(id);

    let number = "?";
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, quote, prefix, suffix, heading, question }),
      });
      const data = await res.json();
      if (data.ok) number = String(data.number);
    } catch {
      thread.exchanges[0].answerHtml = "<p><em>Failed to reach the server.</em></p>";
      renderThread(id);
    }

    attachRef(id, marks[marks.length - 1], number);
    reposition();
  }

  // -------------------------------------------------------- follow-up turns

  async function sendFollowup(id, text) {
    const question = text.trim();
    if (!question) return;
    const a = anns.get(id);
    if (a) {
      // Optimistic: show the question immediately as pending.
      a.thread.exchanges.push({ question, status: "queued" });
      renderThread(id);
      reposition();
    }
    try {
      await fetch("/api/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, question }),
      });
    } catch {
      /* poll will reconcile when the server is reachable */
    }
    poll();
  }

  // ------------------------------------------------------------- anchoring

  function buildNoteElements(id, marks) {
    const note = el("aside", "ha-note ha-note-pending");
    note.dataset.haId = id;
    layer.appendChild(note);
    const aside = el("aside", "ha-inline-note");
    aside.dataset.haId = id;
    aside.hidden = true;
    if (marks.length) {
      blockAncestor(marks[marks.length - 1]).insertAdjacentElement("afterend", aside);
    }
    return { note, aside };
  }

  function attachRef(id, lastMark, number) {
    const sup = el("sup", "ha-ref");
    sup.textContent = String(number);
    sup.dataset.haId = id;
    lastMark.insertAdjacentElement("afterend", sup);
    const a = anns.get(id);
    if (a) {
      a.sup = sup;
      a.thread.number = number;
    }
    sup.addEventListener("click", () => toggleInline(id));
  }

  function wrapRange(range, id) {
    const root =
      range.commonAncestorContainer.nodeType === 3
        ? range.commonAncestorContainer.parentNode
        : range.commonAncestorContainer;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (range.intersectsNode(n) && !inOwnUi(n)) nodes.push(n);
    }
    const marks = [];
    for (const node of nodes) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (start >= end) continue;
      const sub = document.createRange();
      sub.setStart(node, start);
      sub.setEnd(node, end);
      const mark = el("mark", "ha-mark ha-pending");
      mark.dataset.haId = id;
      sub.surroundContents(mark); // always safe within a single text node
      marks.push(mark);
    }
    return marks;
  }

  function blockAncestor(node) {
    let e = node.nodeType === 1 ? node : node.parentElement;
    while (e && e !== document.body) {
      const d = getComputedStyle(e).display;
      if (d !== "inline" && d !== "inline-block") return e;
      e = e.parentElement;
    }
    return document.body;
  }

  function surroundingText(range) {
    const startBlock = blockAncestor(range.startContainer);
    const endBlock = blockAncestor(range.endContainer);
    const before = startBlock.textContent || "";
    const after = endBlock.textContent || "";
    const quote = range.toString();
    const i = before.indexOf(quote.slice(0, 40));
    const prefix = i > 0 ? before.slice(Math.max(0, i - 200), i) : before.slice(-200);
    const j = after.lastIndexOf(quote.slice(-40));
    const suffix =
      j >= 0 ? after.slice(j + quote.slice(-40).length, j + quote.slice(-40).length + 200)
             : after.slice(0, 200);
    return { prefix, suffix };
  }

  function nearestHeading(range) {
    const headings = document.querySelectorAll("h1,h2,h3,h4,h5,h6");
    const anchor = blockAncestor(range.startContainer);
    let best;
    for (const h of headings) {
      if (h.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING) best = h;
    }
    return best ? best.textContent.trim() : undefined;
  }

  // --------------------------------------------------- re-anchor on reload

  // Build a Range for a stored quote by searching the live document text,
  // disambiguating between repeated occurrences with the saved prefix/suffix.
  // This is a text-quote selector: it tolerates the document being regenerated
  // as long as the quoted passage still exists.
  function findRange(quote, prefix, suffix) {
    if (!quote) return null;
    const main = document.querySelector("main") || document.body;
    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        inOwnUi(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
    });
    const nodes = [];
    let text = "";
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push({ node: n, start: text.length, len: n.data.length });
      text += n.data;
    }

    let best = -1;
    let bestScore = -1;
    for (let from = 0; ; ) {
      const i = text.indexOf(quote, from);
      if (i === -1) break;
      const before = text.slice(Math.max(0, i - 40), i);
      const after = text.slice(i + quote.length, i + quote.length + 40);
      const score =
        commonSuffixLen(before, prefix || "") + commonPrefixLen(after, suffix || "");
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
      from = i + 1;
    }
    if (best === -1) return null;

    const s = locate(nodes, best);
    const e = locate(nodes, best + quote.length);
    if (!s || !e) return null;
    const range = document.createRange();
    range.setStart(s.node, s.offset);
    range.setEnd(e.node, e.offset);
    return range;
  }

  function locate(nodes, idx) {
    for (const e of nodes) {
      if (idx >= e.start && idx <= e.start + e.len) {
        return { node: e.node, offset: idx - e.start };
      }
    }
    const last = nodes[nodes.length - 1];
    return last ? { node: last.node, offset: last.len } : null;
  }

  function commonSuffixLen(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
    return n;
  }
  function commonPrefixLen(a, b) {
    let n = 0;
    while (n < a.length && n < b.length && a[n] === b[n]) n++;
    return n;
  }

  // Recreate a thread's UI from server state (used on reload, and for threads
  // created in another browser/tab). Orphaned threads — whose quoted text no
  // longer exists — are shown as an inline note so the comment is never lost.
  function anchorThread(t) {
    const range = findRange(t.quote, t.prefix, t.suffix);
    const marks = range ? wrapRange(range, t.id) : [];
    const { note, aside } = buildNoteElements(t.id, marks);
    const orphan = marks.length === 0;
    anns.set(t.id, { marks, note, aside, sup: null, thread: t, orphan, lastRender: "" });

    if (orphan) {
      note.style.display = "none";
      aside.classList.add("ha-orphan");
      aside.hidden = false;
      (document.querySelector("main") || document.body).appendChild(aside);
    } else {
      attachRef(t.id, marks[marks.length - 1], t.number);
      wireHover(t.id);
    }
    renderThread(t.id);
  }

  // ------------------------------------------------------------- rendering

  function renderThread(id) {
    const a = anns.get(id);
    if (!a) return;
    const t = a.thread;
    const key = JSON.stringify(t.exchanges) + "|" + a.orphan;
    if (key === a.lastRender) return; // avoid clobbering an open reply box
    a.lastRender = key;

    let html = "";
    for (const ex of t.exchanges) {
      html += `<div class="ha-q">${escapeHtml(ex.question)}</div>`;
      const body = ex.answerHtml ?? '<div class="ha-waiting">Asking Claude…</div>';
      html += `<div class="ha-a">${body}</div>`;
    }
    html += '<button type="button" class="ha-reply-btn">Ask a follow-up</button>';

    a.note.innerHTML = html;
    a.aside.innerHTML = html;
    wireReply(id, a.note);
    wireReply(id, a.aside);

    const pending = t.exchanges.some((ex) => ex.answerHtml === undefined);
    a.note.classList.toggle("ha-note-pending", pending);
    for (const m of a.marks) m.classList.toggle("ha-pending", pending);
  }

  function wireReply(id, container) {
    const btn = container.querySelector(".ha-reply-btn");
    if (!btn) return;
    btn.addEventListener("click", () => {
      const box = el("div", "ha-reply-box");
      box.innerHTML =
        '<textarea class="ha-reply-input" rows="2" placeholder="Ask a follow-up…"></textarea>' +
        '<div class="ha-reply-actions">' +
        '<button type="button" class="ha-reply-send">Send</button></div>';
      btn.replaceWith(box);
      const ta = box.querySelector(".ha-reply-input");
      ta.focus();
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendFollowup(id, ta.value);
      });
      box.querySelector(".ha-reply-send").addEventListener("click", () =>
        sendFollowup(id, ta.value),
      );
    });
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function wireHover(id) {
    const a = anns.get(id);
    for (const m of a.marks) {
      m.addEventListener("mouseenter", () => a.note.classList.add("ha-note-active"));
      m.addEventListener("mouseleave", () => a.note.classList.remove("ha-note-active"));
      m.addEventListener("click", () => toggleInline(id));
    }
  }

  function toggleInline(id) {
    const a = anns.get(id);
    if (a.orphan) return; // orphan note is always shown inline
    if (!document.body.classList.contains("ha-narrow")) return;
    a.aside.hidden = !a.aside.hidden;
  }

  // Margin-note layout: absolute positions in document coordinates, stacked
  // downward to avoid overlap. Falls back to inline mode when the right gutter
  // is too small. Orphaned (markless) threads are skipped — they render inline.
  function reposition() {
    const main = document.querySelector("main") || document.body;
    const mainRect = main.getBoundingClientRect();
    const gutter = window.innerWidth - mainRect.right;
    const narrow = gutter < MIN_GUTTER;
    document.body.classList.toggle("ha-narrow", narrow);
    layer.style.display = narrow ? "none" : "";
    if (narrow) return;

    const left = window.scrollX + mainRect.right + 12;
    const width = Math.min(260, gutter - 24);
    const entries = [...anns.values()]
      .filter((a) => !a.orphan && a.marks.length)
      .map((a) => ({
        a,
        top: a.marks[0].getBoundingClientRect().top + window.scrollY,
      }))
      .sort((x, y) => x.top - y.top);
    let floor = 0;
    for (const { a, top } of entries) {
      const y = Math.max(top, floor);
      a.note.style.left = `${left}px`;
      a.note.style.width = `${width}px`;
      a.note.style.top = `${y}px`;
      a.aside.hidden = true;
      floor = y + a.note.offsetHeight + 10;
    }
  }

  window.addEventListener("resize", reposition);
  window.addEventListener("load", () => {
    poll(); // re-anchor any threads already stored server-side
    reposition();
  });

  // --------------------------------------------------------------- polling

  async function poll() {
    let threads;
    try {
      const res = await fetch("/api/questions");
      threads = (await res.json()).threads;
    } catch {
      return; // server briefly unreachable; keep polling
    }
    if (!threads) return;
    for (const t of threads) {
      if (!anns.has(t.id)) {
        anchorThread(t); // reload / cross-tab: rebuild the comment in place
      } else {
        anns.get(t.id).thread = t;
        renderThread(t.id);
      }
    }
    reposition();
  }

  setInterval(poll, POLL_MS);
})();
