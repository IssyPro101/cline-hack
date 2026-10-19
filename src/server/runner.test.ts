import { describe, expect, it } from "vitest";
import { createRun, runs } from "./store";
import { researchRun } from "./runner";
import { plan } from "./planner";
import { MockLLM } from "./adapters/llm";
import type { LLM, WebResearch } from "./adapters/interfaces";
import type {
  CandidateListing,
  PartRequirement,
  RunInput,
} from "../lib/schema";
import { vi, afterEach } from "vitest";

const input: RunInput = {
  goal: "A small motor-driven test fixture",
  budget: 500,
  currency: "AUD",
  shipTo: "Sydney, Australia",
  deadlineDays: 21,
  replay: false,
};
const part = (id: string, name: string): PartRequirement => ({
  id,
  name,
  purpose: "Drive the fixture",
  keySpecs: {},
  quantity: 1,
  category: "off-the-shelf",
  critical: true,
});
afterEach(() => {
  runs.clear();
  vi.unstubAllGlobals();
});

describe("live orchestration", () => {
  it("finishes the other part after one crawler fails", async () => {
    const parts = [
      part("broken", "Failing motor"),
      part("working", "Working motor"),
    ];
    const url = "https://supplier.example/motor";
    const listing: CandidateListing = {
      partId: "working",
      supplier: "Supplier",
      productName: "Working motor",
      productUrl: url,
      price: { amount: 50, currency: "AUD", qty: 1 },
      specsFound: {},
      evidence: [
        {
          field: "price",
          value: 50,
          quote: "AUD 50.00 per unit",
          sourceUrl: url,
          checkedAt: "2026-01-01T00:00:00Z",
        },
      ],
    };
    const llm: LLM = {
      async json({ user, schema }) {
        return schema.parse(
          user.includes('"sourceUrl"')
            ? { listing, rejection: null }
            : { questions: [], assumptions: [], parts },
        );
      },
    };
    const research: WebResearch = {
      async search(query) {
        if (query.includes("Failing"))
          throw new Error("Simulated supplier outage");
        return [{ url, title: "Working motor", excerpts: [] }];
      },
      async extract() {
        return {
          text: "Working motor. AUD 50.00 per unit",
          fetchedAt: "2026-01-01T00:00:00Z",
        };
      },
    };
    const run = createRun(input);
    await researchRun(run, llm, research);
    expect(run.finished).toBe(true);
    expect(run.bom?.rows).toHaveLength(2);
    expect(run.bom?.rows.find((r) => r.part.id === "broken")?.needsQuote).toBe(
      true,
    );
    expect(
      run.bom?.rows.find((r) => r.part.id === "working")?.fields.price.value,
    ).toBe(50);
    expect(
      run.events.some(
        (e) => e.event.type === "error" && e.event.partId === "broken",
      ),
    ).toBe(true);
  });
  it("asks at most two inline questions and accepts a skip", async () => {
    const llm = new MockLLM({
      questions: ["Payload?", "Reach?"],
      assumptions: ["Using the stated task envelope"],
      parts: [part("motor", "Motor")],
    });
    const run = createRun(input);
    const complete = plan(run, llm);
    await vi.waitFor(() => expect(run.question?.id).toBe("clarification-1"));
    run.question!.resolve("300 g");
    await vi.waitFor(() => expect(run.question?.id).toBe("clarification-2"));
    run.question!.resolve("skip");
    const result = await complete;
    expect(result).toHaveLength(1);
    expect(run.events.filter((e) => e.event.type === "question")).toHaveLength(
      2,
    );
    expect(
      run.events.some(
        (e) =>
          e.event.type === "assumption" && e.event.text.includes("Skipped"),
      ),
    ).toBe(true);
  });
});
