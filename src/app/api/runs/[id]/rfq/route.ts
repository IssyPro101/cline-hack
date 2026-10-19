import { z } from "zod";
import { runs } from "@/server/store";
import { rfqText } from "@/server/rfq";
import { config } from "@/server/config";
import { ComposioDrafts } from "@/server/adapters/composio";
const inputSchema = z.object({ partId: z.string(), saveToGmail: z.boolean().default(false), to: z.email().optional() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const run = runs.get((await context.params).id);
  if (!run) return Response.json({ error: "Run expired. Start a new search." }, { status: 404 });
  let raw: unknown; try { raw = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "Provide a part ID and a valid recipient if saving to Gmail." }, { status: 400 });
  const row = run.bom?.rows.find((r) => r.part.id === parsed.data.partId) ?? run.events.flatMap((e) => e.event.type === "part_result" && e.event.partId === parsed.data.partId ? [e.event.row] : [])[0];
  if (!row) return Response.json({ error: "Part not found." }, { status: 404 });
  if (!row.needsQuote) return Response.json({ error: "This part has a sourced price. RFQs are for parts needing a quote." }, { status: 400 });
  const draft = rfqText(row, run.input, run.startedAt);
  if (!parsed.data.saveToGmail) return Response.json({ ...draft, mode: "clipboard" });
  const env = config();
  if (env.MOCK === "1" || run.input.replay || !env.COMPOSIO_API_KEY || !env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID) return Response.json({ ...draft, mode: "clipboard" });
  try { return Response.json({ ...draft, ...await new ComposioDrafts().createEmailDraft({ ...draft, to: parsed.data.to }), mode: "gmail_draft" }); }
  catch { return Response.json({ error: "Gmail could not create the draft. Your copyable text is preserved; check the connected account." }, { status: 502 }); }
}
