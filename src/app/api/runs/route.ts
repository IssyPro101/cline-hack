import { runInputSchema } from "@/lib/schema";
import { config } from "@/server/config";
import { createRun } from "@/server/store";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const parsed = runInputSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });
    const env = config();
    if (env.MOCK === "0" && !parsed.data.replay && (!env.PARALLEL_API_KEY || !env.LLM_API_KEY)) return Response.json({ error: "Live research needs PARALLEL_API_KEY and LLM_API_KEY. Configure .env.local, or use Replay demo." }, { status: 503 });
    const run = createRun(parsed.data);
    return Response.json({ runId: run.id, demo: env.MOCK === "1" || parsed.data.replay }, { status: 201 });
  } catch { return Response.json({ error: "Could not create this run. Check the request and try again." }, { status: 400 }); }
}
