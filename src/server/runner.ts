import { mockEvents } from "../lib/demo";
import { emit, type Run } from "./store";
export async function startRun(run: Run) {
  if (run.started) return;
  run.started = true;
  for (const event of mockEvents(run.id, run.input)) {
    await new Promise((resolve) => setTimeout(resolve, event.type === "part_result" ? 450 : event.type === "listing" ? 100 : 170));
    emit(run, event);
  }
}
