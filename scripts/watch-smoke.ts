import assert from "node:assert/strict";
import { agentEventSchema, type AgentEvent } from "../src/lib/schema";
import { ROBOT_GOAL } from "../src/lib/examples";
const base = process.env.PARTSCOUT_URL || "http://localhost:3002";
async function main() {
  const stop = new AbortController();
  const response = await fetch(`${base}/api/watch/events`, {
    signal: stop.signal,
  });
  assert.equal(response.status, 200);
  const events: AgentEvent[] = [];
  let buffer = "";
  const read = (async () => {
    const reader = response.body!.getReader(),
      decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop()!;
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (line)
            events.push(agentEventSchema.parse(JSON.parse(line.slice(6))));
        }
      }
    } catch (error) {
      if (!stop.signal.aborted) throw error;
    }
  })();
  const created = await fetch(`${base}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      goal: ROBOT_GOAL,
      budget: 3500,
      currency: "AUD",
      shipTo: "Sydney, Australia",
      deadlineDays: 21,
      replay: false,
    }),
  });
  assert.equal(created.status, 201);
  const { runId } = await created.json();
  const runText = await (
    await fetch(`${base}/api/runs/${runId}/events`)
  ).text();
  assert.match(runText, /rfq_drafted/);
  assert.match(runText, /run_finished/);
  assert.match(runText, /sourceType/);
  const until = Date.now() + 20000;
  while (
    Date.now() < until &&
    !events.some(
      (e) =>
        e.type === "bom_updated" &&
        e.bom.runId === runId &&
        e.bom.rows.some((r) => r.status === "quoted"),
    )
  )
    await new Promise((r) => setTimeout(r, 200));
  assert(
    events.some((e) => e.type === "watch_status" && e.watching > 0),
    "Completed BOM must be watched automatically",
  );
  const changed = events.filter(
    (e) => e.type === "change_detected" && e.bomId === runId,
  );
  assert(
    changed.some((e) => e.type === "change_detected" && e.field === "price"),
    "Script must drop one price",
  );
  assert(
    changed.some((e) => e.type === "change_detected" && e.field === "stock"),
    "Next cycle must change stock",
  );
  assert(
    changed.some(
      (e) => e.type === "change_detected" && e.field === "supplierQuote",
    ),
    "Third cycle must simulate a quote",
  );
  assert(
    changed.every(
      (e) =>
        e.type !== "change_detected" ||
        (e.oldValue !== e.newValue && e.evidenceUrl && e.change?.demo),
    ),
    "Changes need old/new values, evidence, and a demo marker",
  );
  assert(
    events.some((e) => e.type === "notification_fallback" && e.bomId === runId),
    "Disconnected Slack must preserve its summary in the UI",
  );
  const latest = events
    .filter((e) => e.type === "bom_updated" && e.bom.runId === runId)
    .at(-1);
  assert(latest?.type === "bom_updated");
  assert.equal(
    latest.bom.rows.find((r) => r.part.category === "custom-fabricated")?.drafts
      ?.length,
    2,
  );
  assert(latest.bom.rows.some((r) => r.status === "quoted"));
  stop.abort();
  await read;
  const reloadStop = new AbortController();
  const reload = await fetch(`${base}/api/watch/events`, {
    signal: reloadStop.signal,
  });
  const chunk = await reload.body!.getReader().read();
  assert.match(new TextDecoder().decode(chunk.value), /watch_snapshot/);
  reloadStop.abort();
  console.log(
    `PASS autonomous Watch: auto-baseline, ${changed.length} material changes over three cycles, quoted evidence, RFQ drafts, fallback summary, reconnect snapshot.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
