import { randomUUID } from "node:crypto";
import {
  agentEventSchema,
  type AgentEvent,
  type Bom,
  type RunInput,
} from "../lib/schema";
export type StoredEvent = { id: number; at: number; event: AgentEvent };
export type Run = {
  id: string;
  input: RunInput;
  events: StoredEvent[];
  startedAt: number;
  started: boolean;
  finished: boolean;
  bom?: Bom;
  listeners: Set<(entry: StoredEvent) => void>;
  question?: { id: string; resolve: (answer: string) => void };
};
const globalStore = globalThis as typeof globalThis & {
  partscoutRuns?: Map<string, Run>;
};
export const runs: Map<string, Run> = (globalStore.partscoutRuns ??= new Map<
  string,
  Run
>());
export function createRun(input: RunInput): Run {
  for (const [id, run] of runs)
    if (Date.now() - run.startedAt > 3600000) runs.delete(id);
  if (runs.size >= 30) {
    const oldest = [...runs.values()].find((r) => r.finished);
    if (oldest) runs.delete(oldest.id);
    else throw new Error("All research slots are busy. Try again shortly.");
  }
  const run: Run = {
    id: randomUUID(),
    input,
    events: [],
    startedAt: Date.now(),
    started: false,
    finished: false,
    listeners: new Set(),
  };
  runs.set(run.id, run);
  return run;
}
export function emit(run: Run, event: AgentEvent) {
  const parsed = agentEventSchema.parse(event);
  const entry = {
    id: run.events.length + 1,
    at: Date.now() - run.startedAt,
    event: parsed,
  };
  run.events.push(entry);
  if (parsed.type === "run_finished") {
    run.bom = parsed.bom;
    run.finished = true;
  }
  run.listeners.forEach((listener) => listener(entry));
}
