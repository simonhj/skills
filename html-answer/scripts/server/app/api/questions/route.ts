import { listThreads, submitQuestion } from "@/lib/state";

export const dynamic = "force-dynamic";

// UI polls this for the full Q&A state (all threads with their exchanges).
export async function GET(): Promise<Response> {
  return Response.json({ threads: listThreads() });
}

// UI submits a new question (new thread) or a follow-up (existing thread id).
// For a follow-up, only `id` and `question` are required; the anchor fields
// are reused from the thread's first turn.
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.question !== "string") {
    return Response.json(
      { ok: false, error: "required fields: id, question" },
      { status: 400 },
    );
  }
  const { thread, exchangeIndex } = submitQuestion({
    id: b.id,
    question: b.question,
    quote: typeof b.quote === "string" ? b.quote : undefined,
    prefix: typeof b.prefix === "string" ? b.prefix : undefined,
    suffix: typeof b.suffix === "string" ? b.suffix : undefined,
    heading: typeof b.heading === "string" ? b.heading : undefined,
  });
  return Response.json(
    { ok: true, id: thread.id, number: thread.number, exchangeIndex },
    { status: 201 },
  );
}
