// html-answer interactive annotator.
// Injected by the server into the generated answer document. Lets the reader
// highlight text, ask a question, and renders the AI's answer as a Tufte
// margin note (inline-expandable fallback on narrow screens).
(() => {
  "use strict";

  const POLL_MS = 1500;
  const MIN_GUTTER = 220; // px of right gutter required for margin notes

  /** id -> { marks: Element[], note: Element, aside: Element, sup: Element|null, status } */
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
    return !!e && !!e.closest(".ha-popover,.ha-ask-btn,.ha-notes-layer,.ha-inline-note");
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

  // ---------------------------------------------------------------- submit

  async function submit() {
    const question = input.value.trim();
    if (!question || !savedRange) return;
    const range = savedRange;
    closePopover();
    window.getSelection()?.removeAllRanges();

    const id = `ha-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const quote = range.toString();
    const { prefix, suffix } = surroundingText(range);
    const heading = nearestHeading(range);
    const marks = wrapRange(range, id);
    if (marks.length === 0) return;

    const note = el("aside", "ha-note ha-note-pending");
    note.dataset.haId = id;
    layer.appendChild(note);
    const aside = el("aside", "ha-inline-note");
    aside.dataset.haId = id;
    aside.hidden = true;
    const lastMark = marks[marks.length - 1];
    blockAncestor(lastMark).insertAdjacentElement("afterend", aside);

    anns.set(id, { marks, note, aside, sup: null, status: "pending" });
    renderContent(id, question, null);
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
      renderContent(id, question, "<p><em>Failed to reach the server.</em></p>");
    }

    const sup = el("sup", "ha-ref");
    sup.textContent = number;
    sup.dataset.haId = id;
    lastMark.insertAdjacentElement("afterend", sup);
    anns.get(id).sup = sup;
    sup.addEventListener("click", () => toggleInline(id));
    reposition();
  }

  // ------------------------------------------------------------- anchoring

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

  // ------------------------------------------------------------- rendering

  function renderContent(id, question, answerHtml) {
    const a = anns.get(id);
    const q = `<div class="ha-q">${escapeHtml(question)}</div>`;
    const body = answerHtml ?? '<div class="ha-waiting">Asking Claude…</div>';
    a.note.innerHTML = q + `<div class="ha-a">${body}</div>`;
    a.aside.innerHTML = a.note.innerHTML;
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
    if (!document.body.classList.contains("ha-narrow")) return;
    const a = anns.get(id);
    a.aside.hidden = !a.aside.hidden;
  }

  // Margin-note layout: absolute positions in document coordinates,
  // stacked downward to avoid overlap. Falls back to inline mode when the
  // right gutter is too small.
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
  window.addEventListener("load", reposition);

  // --------------------------------------------------------------- polling

  async function poll() {
    try {
      const res = await fetch("/api/questions");
      const { questions } = await res.json();
      for (const q of questions) {
        const a = anns.get(q.id);
        if (!a || a.status === "answered" || q.status !== "answered") continue;
        a.status = "answered";
        renderContent(q.id, q.question, q.answerHtml);
        for (const m of a.marks) m.classList.remove("ha-pending");
        a.note.classList.remove("ha-note-pending");
        reposition();
      }
    } catch {
      /* server briefly unreachable; keep polling */
    }
  }

  setInterval(poll, POLL_MS);
})();
