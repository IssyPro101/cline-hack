import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { agentEventSchema } from "../lib/schema";
import { mockEvents } from "../lib/demo";
import { emit, type Run } from "./store";
import { fitBudget, rankPart } from "./ranker";
import { exchangeRates } from "./exchange";
import { report } from "./reporter";
import {ensureRfqDrafts} from "./rfq-drafts";
import {diffBoms} from "./watch/diff";
import {publish} from "./watch/events";
import {config} from "./config";

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
  const finalEntry=log.events.map((e)=>e.event).find((e)=>e.type==="run_finished");
  const rerank=(rows: import("../lib/schema").BomRow[])=>rows.map((r)=>({...rankPart(r.part,r.candidates,r.suppliers,run.input,exchange),drafts:r.drafts}));
  const initialRows=log.events.flatMap((e)=>e.event.type==="part_result"?[e.event.row]:[]);
  const archivedChanges=finalEntry?.type==="run_finished"?diffBoms(report(run.id,run.input,rerank(initialRows),exchange,true),report(run.id,run.input,rerank(finalEntry.bom.rows),exchange,true)):[];
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
    if(event.type==="change_detected") {
      const {partId,field}=event;
      const actual=archivedChanges.find((c)=>c.partId===partId&&c.field===field);
      if(!actual)continue;
      event={type:"change_detected",...actual,change:actual};publish(event);
    }
    if(event.type==="notification_fallback") {event={...event,bomId:run.id};publish(event);}
    // A recorded delivery is history, never a claim that a message was sent now.
    if(event.type==="notification_sent")continue;
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
      const cachedWatch=event.bom.watch;
      const rows = rerank(event.bom.rows);
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
      event.bom=await ensureRfqDrafts(event.bom,e=>emit(run,e));
      if(cachedWatch)event.bom.watch={...cachedWatch,changes:archivedChanges,lastCheckedAt:new Date().toISOString(),nextCheckAt:new Date(Date.now()+config().WATCH_INTERVAL_SECONDS*1000).toISOString()};
    }
    emit(run, event);
  }
}
