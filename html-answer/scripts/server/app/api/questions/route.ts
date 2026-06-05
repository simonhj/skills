import { listQuestions, submitQuestion } from "@/lib/state";

export const dynamic = "force-dynamic";

// UI polls this for the full Q&A state.
export async function GET(): Promise<Response> {
  return Response.json({ questions: listQuestions() });
}

// UI submits a new question.
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.quote !== "string" || typeof b.question !== "string") {
    return Response.json(
      { ok: false, error: "required fields: id, quote, question" },
      { status: 400 },
    );
  }
  const q = submitQuestion({
    id: b.id,
    quote: b.quote,
    question: b.question,
    prefix: typeof b.prefix === "string" ? b.prefix : "",
    suffix: typeof b.suffix === "string" ? b.suffix : "",
    heading: typeof b.heading === "string" ? b.heading : undefined,
  });
  return Response.json({ ok: true, number: q.number }, { status: 201 });
}
