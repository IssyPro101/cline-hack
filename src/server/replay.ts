import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { agentEventSchema } from "../lib/schema";
import { mockEvents } from "../lib/demo";
import { emit, type Run } from "./store";
import { fitBudget, rankPart } from "./ranker";
import { exchangeRates } from "./exchange";
import { report } from "./reporter";

export const replaySchema = z.object({
  version: z.literal(1),
  illustrative: z.boolean(),
  events: z.array(
    z.object({ at: z.number().nonnegative(), event: agentEventSchema }),
  ),
});
export async function replay(run: Run) {
  let log: z.infer<typeof replaySchema>;
  try {
    const path = /weather|rain|humidity/i.test(run.input.goal)
      ? "weather-run.json"
      : "demo-run.json";
    log = replaySchema.parse(
      JSON.parse(await readFile(join(process.cwd(), "fixtures", path), "utf8")),
    );
  } catch {
    log = {
      version: 1,
      illustrative: true,
      events: mockEvents(run.id, run.input).map((event, i) => ({
        at: i * 600,
        event,
      })),
    };
  }
  const exchange = exchangeRates(run.input.currency);
  if (log.illustrative)
    exchange.source = "Illustrative demo · " + exchange.source;
  let previous = 0;
  for (const entry of log.events) {
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(45, Math.min(650, (entry.at - previous) / 3)),
      ),
    );
    previous = entry.at;
    let event = entry.event;
    if (event.type === "run_started") event = { ...event, runId: run.id };
    if (event.type === "part_result")
      event = {
        ...event,
        row: rankPart(
          event.row.part,
          event.row.candidates,
          event.row.suppliers,
          run.input,
          exchange,
        ),
      };
    if (event.type === "run_finished") {
      const rows = event.bom.rows.map((r) =>
        rankPart(r.part, r.candidates, r.suppliers, run.input, exchange),
      );
      event = {
        type: "run_finished",
        bom: report(
          run.id,
          run.input,
          fitBudget(rows, run.input, exchange),
          exchange,
          log.illustrative,
        ),
      };
    }
    emit(run, event);
  }
}
