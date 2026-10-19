import type { PartRequirement, RunInput } from "../lib/schema";
import type { SearchHit } from "./adapters/interfaces";
import { sourceDomain } from "./verifier";

function compact(text: string, length: number) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  const cut = normalized.slice(0, Math.max(0, length));
  return cut.replace(/\s+\S*$/, "").trim() || cut;
}

export function supplierQueries(part: PartRequirement, input: RunInput) {
  const custom = part.category === "custom-fabricated";
  const intents = custom
    ? ["custom fabrication quote", "fabrication manufacturer contact", "custom manufacturing service"]
    : [`buy unit price ${input.currency}`, "distributor in stock", "supplier delivery price", "retailer product price"];
  const name = compact(part.name, 100);
  const destination = compact(input.shipTo, 40);
  const specs = Object.entries(part.keySpecs).map(([key, value]) => `${key} ${value}`).join(" ");
  return intents.map((intent, index) => {
    // Reserve identity, intent and destination first. One broad query avoids
    // making every search depend on verbose engineering specifications.
    const prefix = `${intent} ${name} ${destination}`;
    const remaining = Math.max(0, 200 - prefix.length - 1);
    const extra = index === intents.length - 1 ? "" : compact(specs, remaining);
    return `${prefix}${extra ? ` ${extra}` : ""}`;
  });
}

export function supplierHits(groups: SearchHit[][], limit = 5): SearchHit[] {
  const unique = new Map<string, SearchHit>();
  // Round-robin avoids spending the entire page budget on the first query.
  const count = Math.max(0, ...groups.map(group => group.length));
  for (let index = 0; index < count; index++)
    for (const group of groups) {
      const hit = group[index];
      if (hit && !unique.has(hit.url)) unique.set(hit.url, hit);
    }
  const penalty = (hit: SearchHit) =>
    /\.pdf(?:[?#]|$)/i.test(hit.url) ? 2
      : /\b(datasheet|product brief|documentation|manual)\b/i.test(hit.title) || /\/products?\/?(?:[?#].*)?$/.test(new URL(hit.url).pathname) ? 1 : 0;
  const sorted = [...unique.values()].sort((a, b) => penalty(a) - penalty(b));
  const domains = new Set<string>();
  const first = sorted.filter(hit => {
    const domain = sourceDomain(hit.url);
    if (domains.has(domain)) return false;
    domains.add(domain);
    return true;
  });
  const selected = first.slice(0, limit);
  for (const hit of sorted) {
    if (selected.length >= limit) break;
    if (!selected.some(item => item.url === hit.url)) selected.push(hit);
  }
  return selected;
}
