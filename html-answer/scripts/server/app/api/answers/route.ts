import { submitAnswer } from "@/lib/state";

export const dynamic = "force-dynamic";

// Claude posts the answer for a delivered question.
export async function POST(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string" || typeof b.answerHtml !== "string") {
    return Response.json(
      { ok: false, error: "required fields: id, answerHtml" },
      { status: 400 },
    );
  }
  const q = submitAnswer(b.id, b.answerHtml);
  if (!q) {
    return Response.json({ ok: false, error: "unknown question id" }, { status: 404 });
  }
  return Response.json({ ok: true });
}
