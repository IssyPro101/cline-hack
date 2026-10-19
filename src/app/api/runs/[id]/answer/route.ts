import { z } from "zod";
import { runs } from "@/server/store";
const answerSchema = z.object({
  id: z.string(),
  answer: z.string().trim().min(1).max(1000),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const run = runs.get((await context.params).id);
  if (!run) return Response.json({ error: "Run not found." }, { status: 404 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = answerSchema.safeParse(payload);
  if (!parsed.success)
    return Response.json(
      { error: "Provide a question ID and answer." },
      { status: 400 },
    );
  if (!run.question || run.question.id !== parsed.data.id)
    return Response.json(
      { error: "This question is no longer awaiting an answer." },
      { status: 409 },
    );
  const question = run.question;
  run.question = undefined;
  question.resolve(parsed.data.answer);
  return Response.json({ ok: true });
}
