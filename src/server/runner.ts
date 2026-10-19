import { mockEvents } from "../lib/demo";
import { type BomRow } from "../lib/schema";
import { config } from "./config";
import { CompatibleLLM } from "./adapters/llm";
import { ParallelResearch } from "./adapters/parallel";
import { crawl, withConcurrency } from "./crawler";
import { plan } from "./planner";
import { exchangeRates } from "./exchange";
import { rankPart } from "./ranker";
import { report } from "./reporter";
import { replay } from "./replay";
import { emit, type Run } from "./store";
export async function startRun(run: Run) {
  if (run.started) return;
  run.started = true;
  if (run.input.replay) { await replay(run); return; }
  if (config().MOCK === "1") {
    for (const event of mockEvents(run.id, run.input)) {
      await new Promise((resolve) => setTimeout(resolve, event.type === "part_result" ? 450 : event.type === "listing" ? 100 : 170));
      emit(run, event);
    }
    return;
  }
  const exchange = exchangeRates(run.input.currency);
  const rows: BomRow[] = [];
  emit(run, { type: "run_started", runId: run.id });
  try {
    const llm = new CompatibleLLM(), research = new ParallelResearch();
    const parts = await plan(run, llm);
    emit(run, { type: "assumption", text: exchange.source + ". Shipping charges and unknown tax are excluded from totals." });
    await withConcurrency(parts, 5, async (part) => {
      let result: { candidates: BomRow["candidates"]; suppliers: BomRow["suppliers"] } = { candidates: [], suppliers: [] };
      try { result = await crawl(run, part, research, llm); }
      catch { emit(run, { type: "error", partId: part.id, message: "This crawler could not find verifiable results. The part remains unknown; the other crawlers will continue." }); }
      const row = rankPart(part, result.candidates, result.suppliers, run.input, exchange);
      rows.push(row); emit(run, { type: "part_result", partId: part.id, row });
    });
    rows.sort((a,b) => parts.findIndex((p) => p.id === a.part.id) - parts.findIndex((p) => p.id === b.part.id));
  } catch (error) {
    emit(run, { type: "error", message: error instanceof Error ? error.message : "Planning failed. Check the research configuration." });
  }
  emit(run, { type: "run_finished", bom: report(run.id, run.input, rows, exchange) });
}
