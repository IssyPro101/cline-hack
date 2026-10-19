"use client";
import { useState } from "react";
import { ROBOT_GOAL } from "@/lib/demo";
import { agentEventSchema, type BomRow } from "@/lib/schema";
export default function Home() {
  const [rows, setRows] = useState<BomRow[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  async function start() {
    setRows([]); setLogs([]);
    const response = await fetch("/api/runs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ goal: ROBOT_GOAL, budget: 3500, currency: "AUD", shipTo: "Sydney, Australia", deadlineDays: 21 }) });
    const { runId } = await response.json();
    const source = new EventSource(`/api/runs/${runId}/events`);
    source.onmessage = ({ data }) => { const event = agentEventSchema.parse(JSON.parse(data)); setLogs((l) => [...l, event.type]); if (event.type === "part_result") setRows((r) => [...r, event.row]); if (event.type === "run_finished") source.close(); };
  }
  return <main><h1>PartScout</h1><p>Every part. Every source.</p><button onClick={start}>Replay demo</button><div className="basic-panels"><section><h2>Agent activity</h2>{logs.map((l,i) => <p key={i}>{l}</p>)}</section><section><h2>Bill of materials</h2>{rows.map((r) => <p key={r.part.id}>{r.part.name} — {r.fields.price.value ?? "Needs quote"} · {r.status}</p>)}</section></div></main>;
}
