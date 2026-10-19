import { describe, expect, it } from "vitest";
import { groundListing, quoteInText } from "./evidence";
import { demoParts, demoRow } from "../lib/demo";
import { ROBOT_GOAL } from "../lib/examples";
import type { RunInput } from "../lib/schema";
const input: RunInput = {
  goal: ROBOT_GOAL,
  budget: 3500,
  currency: "AUD",
  shipTo: "Sydney, Australia",
  deadlineDays: 21,
  replay: false,
};
const original = () => demoRow(demoParts(input)[0], input).candidates[0];
describe("evidence grounding", () => {
  it("requires exact quotes after whitespace normalization", () => {
    expect(quoteInText("In stock", "Price AUD 10. In  stock")).toBe(true);
    expect(quoteInText("Ships tomorrow", "In stock")).toBe(false);
  });
  it("drops hallucinated prices even when the number is plausible", () => {
    const l = original();
    expect(
      groundListing(
        l,
        "No pricing published",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).price,
    ).toBeUndefined();
  });
  it("keeps sourced values and replaces model provenance", () => {
    const l = original();
    const text = l.evidence.map((e) => e.quote).join("\n");
    const result = groundListing(
      l,
      text,
      "https://actual.example/page",
      "2026-01-01T00:00:00Z",
      input.shipTo,
    );
    expect(result.price?.amount).toBe(1699);
    expect(
      result.evidence.every(
        (e) => e.sourceUrl === "https://actual.example/page",
      ),
    ).toBe(true);
    expect(
      result.evidence.every((e) => e.checkedAt === "2026-01-01T00:00:00Z"),
    ).toBe(true);
  });
  it("drops a price when its quote cites a different number", () => {
    const l = original();
    l.evidence[0].quote = "AUD 20.00 per unit";
    expect(
      groundListing(
        l,
        "AUD 20.00 per unit",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).price,
    ).toBeUndefined();
  });
  it("does not guess what a bare dollar means", () => {
    const l = original();
    l.evidence[0].quote = "$1699.00 per unit";
    expect(
      groundListing(
        l,
        "$1699.00 per unit",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).price,
    ).toBeUndefined();
  });
  it("does not confuse not-in-stock with in-stock", () => {
    const l = original();
    l.evidence[1].quote = "Not in stock";
    expect(
      groundListing(
        l,
        "Not in stock",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).stock,
    ).toBeUndefined();
  });
  it("does not infer destination shipping from an unrelated country", () => {
    const l = original();
    l.evidence[3].quote = "Ships to Germany";
    expect(
      groundListing(
        l,
        "Ships to Germany",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).shipsToDestination,
    ).toBeUndefined();
  });
  it("converts weeks and business days to conservative calendar days", () => {
    const l = original();
    l.leadTimeDays = 14;
    l.evidence[2].value = 14;
    l.evidence[2].quote = "Delivery in 1–2 weeks";
    expect(
      groundListing(
        l,
        "Delivery in 1–2 weeks",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).leadTimeDays,
    ).toBe(14);
    l.leadTimeDays = 7;
    l.evidence[2].value = 7;
    l.evidence[2].quote = "Ships in 5 business days";
    expect(
      groundListing(
        l,
        "Ships in 5 business days",
        l.productUrl,
        new Date().toISOString(),
        input.shipTo,
      ).leadTimeDays,
    ).toBe(7);
  });
});
