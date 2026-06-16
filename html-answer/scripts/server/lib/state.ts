// In-memory, ephemeral Q&A state. Anchored on globalThis so it survives
// next-dev HMR module reloads. Lost when the server process exits — by design.
//
// Each highlighted passage owns a *thread*: one anchor (quote + surrounding
// text) and an ordered list of exchanges (question -> answer). Follow-up
// questions append exchanges to the same thread so the conversation continues
// in place. The static HTML file is never modified; threads are re-anchored
// client-side on reload via the stored quote/prefix/suffix.

export type ExchangeStatus = "queued" | "delivered" | "answered";

export interface Exchange {
  question: string;
  answerHtml?: string;
  status: ExchangeStatus;
  askedAt: number;
}

export interface Thread {
  id: string;
  number: number; // display order, assigned server-side
  quote: string;
  prefix: string;
  suffix: string;
  heading?: string;
  exchanges: Exchange[];
  createdAt: number;
}

// What the Claude-side waiter receives: the thread anchor, the new question,
// and the prior turns so the answer carries the conversation's context.
export interface DeliveredQuestion {
  id: string; // thread id
  number: number;
  quote: string;
  prefix: string;
  suffix: string;
  heading?: string;
  question: string; // the newly asked question
  exchangeIndex: number; // position of this question within the thread
  isFollowup: boolean;
  history: Array<{ question: string; answerHtml?: string }>;
}

interface State {
  threads: Map<string, Thread>;
  // Parked long-poll resolvers (the Claude-side waiter). Resolved FIFO.
  waiters: Array<(q: DeliveredQuestion) => void>;
  nextNumber: number;
}

const g = globalThis as typeof globalThis & { __haState?: State };
g.__haState ??= { threads: new Map(), waiters: [], nextNumber: 1 };
const state = g.__haState;

export function listThreads(): Thread[] {
  return [...state.threads.values()].sort((a, b) => a.number - b.number);
}

function toDelivered(thread: Thread, idx: number): DeliveredQuestion {
  const ex = thread.exchanges[idx];
  return {
    id: thread.id,
    number: thread.number,
    quote: thread.quote,
    prefix: thread.prefix,
    suffix: thread.suffix,
    heading: thread.heading,
    question: ex.question,
    exchangeIndex: idx,
    isFollowup: idx > 0,
    history: thread.exchanges
      .slice(0, idx)
      .map((e) => ({ question: e.question, answerHtml: e.answerHtml })),
  };
}

// Create a new thread or append a follow-up to an existing one. The client
// sends the same id for a follow-up; quote/prefix/suffix/heading are taken
// from the first turn and ignored on follow-ups.
export function submitQuestion(input: {
  id: string;
  quote?: string;
  prefix?: string;
  suffix?: string;
  heading?: string;
  question: string;
}): { thread: Thread; exchangeIndex: number } {
  let thread = state.threads.get(input.id);
  if (!thread) {
    thread = {
      id: input.id,
      number: state.nextNumber++,
      quote: input.quote ?? "",
      prefix: input.prefix ?? "",
      suffix: input.suffix ?? "",
      heading: input.heading,
      exchanges: [],
      createdAt: Date.now(),
    };
    state.threads.set(thread.id, thread);
  }
  const ex: Exchange = {
    question: input.question,
    status: "queued",
    askedAt: Date.now(),
  };
  thread.exchanges.push(ex);
  const idx = thread.exchanges.length - 1;

  const waiter = state.waiters.shift();
  if (waiter) {
    ex.status = "delivered";
    waiter(toDelivered(thread, idx));
  }
  return { thread, exchangeIndex: idx };
}

/** Long-poll: resolve with the oldest queued question, or null after timeoutMs. */
export function waitForQuestion(timeoutMs: number): Promise<DeliveredQuestion | null> {
  for (const t of listThreads()) {
    const idx = t.exchanges.findIndex((e) => e.status === "queued");
    if (idx !== -1) {
      t.exchanges[idx].status = "delivered";
      return Promise.resolve(toDelivered(t, idx));
    }
  }
  return new Promise((resolve) => {
    const waiter = (q: DeliveredQuestion) => {
      clearTimeout(timer);
      resolve(q);
    };
    const timer = setTimeout(() => {
      const i = state.waiters.indexOf(waiter);
      if (i !== -1) state.waiters.splice(i, 1);
      resolve(null);
    }, timeoutMs);
    state.waiters.push(waiter);
  });
}

// Answer the oldest unanswered exchange in the thread (the one just delivered).
export function submitAnswer(id: string, answerHtml: string): Thread | null {
  const t = state.threads.get(id);
  if (!t) return null;
  const ex =
    t.exchanges.find((e) => e.status === "delivered" && e.answerHtml === undefined) ??
    t.exchanges.find((e) => e.answerHtml === undefined);
  if (!ex) return null;
  ex.answerHtml = answerHtml;
  ex.status = "answered";
  return t;
}
