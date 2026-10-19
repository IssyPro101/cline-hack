import { z } from "zod";
import { config } from "../config";
import type { WebResearch } from "./interfaces";

const resultSchema = z.object({ url: z.url(), title: z.string().nullish(), excerpts: z.array(z.string()).default([]), full_content: z.string().nullish() });
const responseSchema = z.object({ results: z.array(resultSchema).default([]), errors: z.array(z.unknown()).optional() });
export function publicUrl(raw: string) {
  try {
    const url = new URL(raw);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname) && url.hostname.includes(".") && !/\.(local|internal|localhost)$/i.test(url.hostname);
  } catch { return false; }
}
export class ParallelResearch implements WebResearch {
  private async request(path: "search" | "extract", body: unknown) {
    const response = await fetch(`https://api.parallel.ai/v1/${path}`, {
      method: "POST", headers: { "x-api-key": config().PARALLEL_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal: AbortSignal.timeout(55000),
    });
    if (!response.ok) throw new Error(`Parallel ${path} returned HTTP ${response.status}.`);
    return responseSchema.parse(await response.json());
  }
  async search(query: string, opts?: { country?: string; limit?: number }) {
    const result = await this.request("search", { objective: query, search_queries: [query.slice(0, 200)], mode: "fast", advanced_settings: { max_results: opts?.limit ?? 4, ...(opts?.country ? { location: opts.country } : {}) } });
    return result.results.filter((r) => publicUrl(r.url)).map((r) => ({ url: r.url, title: r.title ?? new URL(r.url).hostname, excerpts: r.excerpts }));
  }
  async extract(url: string, objective: string) {
    if (!publicUrl(url)) throw new Error("Only public HTTP supplier pages can be researched.");
    const result = await this.request("extract", { urls: [url], objective, max_chars_total: 16000, advanced_settings: { excerpt_settings: { max_chars_per_result: 12000 }, full_content: { max_chars_per_result: 16000 }, fetch_policy: { max_age_seconds: 600, timeout_seconds: 30, disable_cache_fallback: true } } });
    const page = result.results.find((r) => r.url === url) ?? result.results[0];
    if (!page) throw new Error("Supplier page could not be extracted. No values were inferred.");
    return { text: page.full_content || page.excerpts.join("\n\n"), fetchedAt: new Date().toISOString() };
  }
}
export class MockResearch implements WebResearch {
  async search(query: string) { return [{ url: "https://supplier.example/part", title: query, excerpts: ["Demo fixture: AUD 100.00. In stock. Ships to Australia in 7 days."] }]; }
  async extract() { return { text: "Demo fixture: AUD 100.00. In stock. Ships to Australia in 7 days.", fetchedAt: "2026-10-18T09:30:00.000Z" }; }
}
