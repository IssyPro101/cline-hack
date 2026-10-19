import assert from "node:assert/strict";
import { agentEventSchema, type AgentEvent } from "../src/lib/schema";
import { ROBOT_GOAL, WEATHER_GOAL } from "../src/lib/examples";
import { toCsv } from "../src/lib/format";
const base = process.env.PARTSCOUT_URL || "http://localhost:3000";
async function post(path: string, body: unknown) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function scenario(goal: string, replay: boolean, currency = "AUD") {
  const created = await post("/api/runs", {
    goal,
    budget: 3500,
    currency,
    shipTo: "Sydney, Australia",
    deadlineDays: 21,
    replay,
  });
  assert.equal(created.status, 201);
  const { runId } = await created.json();
  const stream = await fetch(`${base}/api/runs/${runId}/events`, {
    signal: AbortSignal.timeout(45000),
  });
  assert.match(stream.headers.get("content-type") || "", /event-stream/);
  const reader = stream.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: AgentEvent[] = [];
  let chunks = 0;
  const times: number[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks++;
    times.push(Date.now());
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop()!;
    for (const frame of frames) {
      const data = frame.split("\n").find((line) => line.startsWith("data: "));
      if (data) events.push(agentEventSchema.parse(JSON.parse(data.slice(6))));
    }
  }
  const final = events.find((event) => event.type === "run_finished");
  assert(final?.type === "run_finished");
  const bom = final.bom;
  assert(bom.rows.length >= 5);
  assert(chunks > 3, "Response must arrive in multiple chunks");
  assert(times.at(-1)! - times[0] > 1000, "Stream must be progressive");
  assert(bom.rows.some((r) => r.status === "agreed"));
  assert(bom.rows.some((r) => r.status === "single_source"));
  assert(bom.rows.some((r) => r.status === "conflicting"));
  const quote = bom.rows.find((r) => r.needsQuote)!;
  assert(quote);
  assert.equal(quote.fields.price.status, "unknown");
  assert.equal(quote.fields.price.value, undefined);
  const draft = await post(`/api/runs/${runId}/rfq`, { partId: quote.part.id });
  assert.equal(draft.status, 200);
  const text = await draft.json();
  assert.match(text.body, /Ship to: Sydney/);
  assert.equal(text.mode, "clipboard");
  assert.match(toCsv(bom), /Illustrative demo/);
  assert.match(toCsv(bom), /Checked at/);
  const log = await (await fetch(`${base}/api/runs/${runId}/log`)).json();
  assert(log.events.length >= events.length);
  const resumed = await (
    await fetch(`${base}/api/runs/${runId}/events`, {
      headers: { "Last-Event-ID": String(events.length - 1) },
      signal: AbortSignal.timeout(5000),
    })
  ).text();
  assert.match(resumed, /run_finished/);
  assert(!resumed.includes('"type":"plan"'));
  console.log(
    `PASS ${replay ? "replay" : "mock"} ${currency}: ${bom.rows.length} rows, ${chunks} chunks, ${bom.quoteCount} quote, ${bom.total}–${bom.totalMax} ${currency}`,
  );
}
async function main() {
  const invalid = await post("/api/runs", { goal: "x" });
  assert.equal(invalid.status, 400);
  await scenario(ROBOT_GOAL, false);
  await scenario(WEATHER_GOAL, false);
  await scenario(ROBOT_GOAL, true, "USD");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
