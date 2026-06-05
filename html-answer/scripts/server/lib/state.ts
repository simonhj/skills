// In-memory, ephemeral Q&A state. Anchored on globalThis so it survives
// next-dev HMR module reloads. Lost when the server process exits — by design.

export type QuestionStatus = "queued" | "delivered" | "answered";

export interface Question {
  id: string;
  number: number; // display order, assigned server-side
  quote: string;
  prefix: string;
  suffix: string;
  heading?: string;
  question: string;
  status: QuestionStatus;
  answerHtml?: string;
  createdAt: number;
}

interface State {
  questions: Map<string, Question>;
  // Parked long-poll resolvers (the Claude-side waiter). Resolved FIFO.
  waiters: Array<(q: Question) => void>;
  nextNumber: number;
}

const g = globalThis as typeof globalThis & { __haState?: State };
g.__haState ??= { questions: new Map(), waiters: [], nextNumber: 1 };
const state = g.__haState;

export function listQuestions(): Question[] {
  return [...state.questions.values()].sort((a, b) => a.number - b.number);
}

export function submitQuestion(input: {
  id: string;
  quote: string;
  prefix: string;
  suffix: string;
  heading?: string;
  question: string;
}): Question {
  const q: Question = {
    ...input,
    number: state.nextNumber++,
    status: "queued",
    createdAt: Date.now(),
  };
  state.questions.set(q.id, q);
  const waiter = state.waiters.shift();
  if (waiter) {
    q.status = "delivered";
    waiter(q);
  }
  return q;
}

/** Long-poll: resolve with the oldest queued question, or null after timeoutMs. */
export function waitForQuestion(timeoutMs: number): Promise<Question | null> {
  const queued = listQuestions().find((q) => q.status === "queued");
  if (queued) {
    queued.status = "delivered";
    return Promise.resolve(queued);
  }
  return new Promise((resolve) => {
    const waiter = (q: Question) => {
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

export function submitAnswer(id: string, answerHtml: string): Question | null {
  const q = state.questions.get(id);
  if (!q) return null;
  q.answerHtml = answerHtml;
  q.status = "answered";
  return q;
}
