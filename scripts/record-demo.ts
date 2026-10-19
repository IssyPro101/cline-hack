import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mockEvents } from "../src/lib/demo";
import { ROBOT_GOAL, WEATHER_GOAL } from "../src/lib/examples";
import { replaySchema } from "../src/server/replay";
import { ensureRfqDrafts } from "../src/server/rfq-drafts";
import { scriptedCheck } from "../src/server/watch/demo";
import { diffBoms } from "../src/server/watch/diff";
import { summaryFor } from "../src/server/watch/engine";
import { withEvidenceTypes } from "../src/lib/provenance";
import type { AgentEvent } from "../src/lib/schema";

async function main() {
  const fixtureDir = join(process.cwd(), "fixtures");
  await mkdir(fixtureDir, { recursive: true });
  const runId = process.argv
    .find((arg) => arg.startsWith("--run-id="))
    ?.split("=")[1];
  if (runId) {
    const base = process.env.PARTSCOUT_URL || "http://localhost:3000";
    const response = await fetch(
      `${base}/api/runs/${encodeURIComponent(runId)}/log`,
    );
    if (!response.ok)
      throw new Error("A completed, still-active run is required.");
    const log = replaySchema.parse(await response.json());
    // Recording is explicit. Review the resulting goal and destination before committing.
    await writeFile(
      join(fixtureDir, "demo-run.json"),
      JSON.stringify(log, null, 2) + "\n",
    );
    console.log(
      `Recorded ${log.events.length} events. ${log.illustrative ? "Illustrative demo." : "Live research archive; review for personal data before committing."}`,
    );
    return;
  }
  if (!process.argv.includes("--illustrative"))
    throw new Error(
      "Use --run-id=<id> to record a completed live run, or --illustrative to generate labeled offline fixtures.",
    );
  for (const [name, goal, budget] of [
    ["demo-run.json", ROBOT_GOAL, 3500],
    ["weather-run.json", WEATHER_GOAL, 200],
  ] as const) {
    const events: AgentEvent[] = mockEvents("cached-demo", {
      goal,
      budget,
      currency: "AUD",
      shipTo: "Sydney, Australia",
      deadlineDays: 21,
      replay: false,
    });
    const final = events.pop()!;
    if (final.type !== "run_finished")
      throw new Error("Demo has no completed BOM.");
    await ensureRfqDrafts(final.bom, (e) => events.push(e));
    const updated = scriptedCheck(final.bom);
    const changes = diffBoms(final.bom, updated, "2026-10-18T09:31:00.000Z");
    const summary = summaryFor(updated, changes);
    updated.watch = {
      cycle: 1,
      lastCheckedAt: "2026-10-18T09:31:00.000Z",
      nextCheckAt: "2026-10-18T09:32:00.000Z",
      changes,
      notification: {
        status: "fallback",
        at: "2026-10-18T09:31:00.000Z",
        summary,
        error: "Archived demo: no real Slack delivery is claimed.",
      },
    };
    changes.forEach((change) =>
      events.push({ type: "change_detected", ...change, change }),
    );
    events.push({
      type: "notification_fallback",
      bomId: updated.runId,
      summary,
      reason: "Archived demo: no real Slack delivery is claimed.",
    });
    events.push({ type: "run_finished", bom: updated });
    const log = replaySchema.parse(
      withEvidenceTypes({
        version: 1,
        illustrative: true,
        events: events.map((event, i) => ({ at: i * 600, event })),
      }),
    );
    await writeFile(
      join(fixtureDir, name),
      JSON.stringify(log, null, 2) + "\n",
    );
    console.log(`Generated ${name}: ${events.length} illustrative events.`);
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
