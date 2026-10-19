import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { mockEvents } from "../src/lib/demo";
import { ROBOT_GOAL, WEATHER_GOAL } from "../src/lib/examples";
import { replaySchema } from "../src/server/replay";

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
    const events = mockEvents("cached-demo", {
      goal,
      budget,
      currency: "AUD",
      shipTo: "Sydney, Australia",
      deadlineDays: 21,
      replay: false,
    });
    const log = replaySchema.parse({
      version: 1,
      illustrative: true,
      events: events.map((event, i) => ({ at: i * 600, event })),
    });
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
