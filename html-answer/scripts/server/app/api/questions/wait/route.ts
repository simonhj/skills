import { waitForQuestion } from "@/lib/state";

export const dynamic = "force-dynamic";

// Long-poll endpoint for the Claude-side waiter. Returns
//   {type:"question", question:{...}}  when a question is (or becomes) available
//   {type:"timeout"}                   after timeoutMs with no question
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const raw = Number(url.searchParams.get("timeoutMs") ?? "50000");
  const timeoutMs = Math.min(Math.max(raw || 50000, 1000), 110_000);
  const q = await waitForQuestion(timeoutMs);
  if (!q) return Response.json({ type: "timeout" });
  return Response.json({ type: "question", question: q });
}
