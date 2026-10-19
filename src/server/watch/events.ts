import { agentEventSchema, type AgentEvent } from "../../lib/schema";
import { withEvidenceTypes } from "../../lib/provenance";
import { runs, emit } from "../store";
type WatchEvent = { id: number; event: AgentEvent };
type Bus = {
  next: number;
  events: WatchEvent[];
  listeners: Set<(entry: WatchEvent) => void>;
};
const globals = globalThis as typeof globalThis & { partscoutWatchBus?: Bus };
const bus: Bus = (globals.partscoutWatchBus ??= {
  next: 1,
  events: [],
  listeners: new Set(),
});
export function publish(event: AgentEvent) {
  const entry = {
    id: bus.next++,
    event: agentEventSchema.parse(withEvidenceTypes(event)),
  };
  bus.events.push(entry);
  const bomId =
    entry.event.type === "bom_updated"
      ? entry.event.bom.runId
      : "bomId" in entry.event
        ? entry.event.bomId
        : undefined;
  const run = bomId ? runs.get(bomId) : undefined;
  if (run?.finished) emit(run, entry.event);
  if (bus.events.length > 300) bus.events.shift();
  bus.listeners.forEach((listener) => {
    try {
      listener(entry);
    } catch {
      bus.listeners.delete(listener);
    }
  });
}
export function subscribe(
  listener: (entry: WatchEvent) => void,
  after?: number,
) {
  bus.listeners.add(listener);
  if (after !== undefined)
    bus.events.filter((e) => e.id > after).forEach(listener);
  return () => bus.listeners.delete(listener);
}
