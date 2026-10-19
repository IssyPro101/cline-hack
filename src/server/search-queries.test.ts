import { describe, expect, it, vi, afterEach } from "vitest";
import { supplierQueries, supplierHits } from "./search-queries";
import { ParallelResearch } from "./adapters/parallel";
import type { PartRequirement, RunInput } from "../lib/schema";

const input: RunInput = { goal: "A Pico bench prototype", budget: 100, currency: "USD", shipTo: "San Francisco, California, USA", deadlineDays: 30, replay: false };
const part: PartRequirement = { id: "pico", name: "Raspberry Pi Pico RP2040 without headers", purpose: "Control a prototype", keySpecs: { model: "RP2040", engineering: "precise engineering specification ".repeat(60) }, quantity: 1, category: "off-the-shelf", critical: true };
afterEach(() => vi.unstubAllGlobals());

describe("supplier query construction", () => {
  it("keeps four distinct commercial queries within the API limit even with long specs", () => {
    const queries = supplierQueries(part, input);
    expect(queries).toHaveLength(4);
    expect(new Set(queries).size).toBe(4);
    expect(queries.every(query => query.length <= 200)).toBe(true);
    expect(queries.every(query => query.includes(part.name) && query.includes(input.shipTo))).toBe(true);
    expect(queries[0]).toMatch(/^buy unit price USD/);
    expect(queries[1]).toMatch(/^distributor in stock/);
    expect(queries[2]).toMatch(/^supplier delivery price/);
    expect(queries[3]).toMatch(/^retailer product price/);
    expect(queries[3]).not.toContain("engineering");
  });
  it("bounds maximal names and destinations and preserves fabrication intent", () => {
    const queries = supplierQueries({ ...part, name: "long component name ".repeat(20), category: "custom-fabricated" }, { ...input, shipTo: "long destination ".repeat(20) });
    expect(queries).toHaveLength(3);
    expect(queries.every(query => query.length <= 200)).toBe(true);
    expect(queries[0]).toMatch(/^custom fabrication quote/);
    expect(new Set(queries).size).toBe(3);
  });
  it("prefers diverse supplier pages over repeated manufacturer PDFs", () => {
    const hit = (url: string, title = "Product") => ({ url, title, excerpts: [] });
    const selected = supplierHits([
      [hit("https://maker.example/a.pdf"), hit("https://maker.example/b.pdf"), hit("https://maker.example/products/")],
      [hit("https://shop-one.example/product/pico"), hit("https://shop-one.example/product/other")],
      [hit("https://shop-two.example/pico"), hit("https://shop-three.example/pico")],
    ], 3);
    expect(selected.map(item => new URL(item.url).hostname)).toEqual(["shop-one.example", "shop-two.example", "shop-three.example"]);
    expect(supplierHits([], 5)).toEqual([]);
  });
  it("sends bounded keywords, complete intent and documented settings to Parallel", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ results: [] }));
    vi.stubGlobal("fetch", fetch);
    const query = `${"Detailed component specifications ".repeat(20)} buy price USD retailer`;
    await new ParallelResearch().search(query, { limit: 8 });
    const [url, request] = fetch.mock.calls[0];
    const body = JSON.parse(request.body);
    expect(url).toBe("https://api.parallel.ai/v1/search");
    expect(body.search_queries[0].length).toBeLessThanOrEqual(200);
    expect(body.search_queries[0]).toContain("buy price USD retailer");
    expect(body.objective).toContain(query.replace(/\s+/g, " ").trim());
    expect(body.objective).toContain("purchasable listings");
    expect(body.advanced_settings.max_results).toBe(8);
  });
});
