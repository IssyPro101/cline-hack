import { describe, expect, it } from "vitest";
import { demoParts, demoRow, ROBOT_GOAL } from "../lib/demo";
import { exchangeRates } from "./exchange";
import { rankPart } from "./ranker";
import { report } from "./reporter";
import { withConcurrency } from "./crawler";
import type { RunInput } from "../lib/schema";
const input: RunInput = { goal: ROBOT_GOAL, budget:3500, currency:"AUD", shipTo:"Sydney, Australia", deadlineDays:21, replay:false };
describe("ranker and rule-driven reporter", () => {
  it("excludes unpriced parts and exposes the unknown count", () => { const row=rankPart(demoParts(input)[0],[],[],input,exchangeRates("AUD")); const bom=report("test",input,[row],exchangeRates("AUD")); expect(bom.total).toBe(0); expect(bom.quoteCount).toBe(1); expect(bom.risks.some((r)=>r.message.includes("excluded"))).toBe(true); });
  it("retains conflict ranges and uses the upper bound for budget remaining", () => { const p=demoParts(input).find((p)=>p.id==="camera")!; const row=demoRow(p,input); const bom=report("test",input,[row],exchangeRates("AUD")); expect(bom.totalMax).toBeGreaterThan(bom.total); expect(bom.budgetRemaining).toBeCloseTo(input.budget-bom.totalMax); });
  it("flags budget overruns honestly", () => { const bom=report("test",{...input,budget:1},[demoRow(demoParts(input)[0],input)],exchangeRates("AUD")); expect(bom.budgetRemaining).toBeLessThan(0); expect(bom.risks.some((r)=>r.message.includes("exceed"))).toBe(true); });
  it("includes whole packs in the subtotal", () => { const row=demoRow(demoParts(input)[0],input); row.purchaseQuantity=5; expect(report("test",input,[row],exchangeRates("AUD")).total).toBe(1699*5); });
  it("never selects a clearly rejected candidate", () => { const p=demoParts(input)[0]; const c=demoRow(p,input).candidates[0]; c.rejectedReason="Fails payload"; expect(rankPart(p,[c],[],input,exchangeRates("AUD")).needsQuote).toBe(true); });
  it("limits concurrently running crawlers", async () => { let active=0,max=0; await withConcurrency(Array.from({length:12},(_,i)=>i),5,async ()=>{active++;max=Math.max(max,active);await new Promise((r)=>setTimeout(r,2));active--;}); expect(max).toBe(5); });
});
