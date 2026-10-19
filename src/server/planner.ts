import { z } from "zod";
import { partSchema, type PartRequirement } from "../lib/schema";
import type { LLM } from "./adapters/interfaces";
import { emit, type Run } from "./store";

export const planSchema = z.object({
  questions: z.array(z.string().min(1).max(350)).max(2),
  assumptions: z.array(z.string().max(500)).max(8),
  parts: z.array(partSchema).min(1).max(12),
}).refine((p) => new Set(p.parts.map((part) => part.id)).size === p.parts.length, "Part IDs must be unique");

export async function plan(run: Run, llm: LLM): Promise<PartRequirement[]> {
  const system = "You are a hardware sourcing engineer. Produce a complete bill of materials of at most 12 task-sized parts. Match payload, reach, voltage, interfaces, and compatibility to the goal. Give stable slug IDs. Set critical for indispensable or safety-critical parts. Custom brackets, enclosures or fixtures without standard catalogue equivalents are custom-fabricated. Ask no more than TWO questions, and only if the answer materially changes cost or the part list. Otherwise give explicit assumptions and proceed. Do not provide prices or vendors. You must always return a provisional parts array, even when asking questions.";
  let result = await llm.json({ system, user: JSON.stringify(run.input), schema: planSchema });
  const answers: { question: string; answer: string }[] = [];
  for (const [index, text] of result.questions.entries()) {
    const id = `clarification-${index + 1}`;
    const answer = await new Promise<string>((resolve) => {
      // The human can answer or skip; no deadline silently answers on their behalf.
      run.question = { id, resolve };
      emit(run, { type: "question", id, text });
    });
    answers.push({ question: text, answer });
    run.question = undefined;
    if (answer === "skip") emit(run, { type: "assumption", text: `Skipped clarification: ${text} The planner will state its working assumption.` });
  }
  if (answers.length) result = await llm.json({ system: system + " All clarification opportunities are exhausted. Return questions: [] and finalize the plan using the user's answers and explicit assumptions for skipped questions.", user: JSON.stringify({ input: run.input, answers }), schema: planSchema });
  result.assumptions.forEach((text) => emit(run, { type: "assumption", text }));
  emit(run, { type: "plan", parts: result.parts });
  return result.parts;
}
