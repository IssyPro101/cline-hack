import type { BomRow, CandidateListing, ExchangeRates, PartRequirement, RunInput, Supplier } from "../lib/schema";
import { overallStatus, productGroup, unitPrice, verifyGroup } from "./verifier";

export function rankPart(part: PartRequirement, candidates: CandidateListing[], suppliers: Supplier[], input: RunInput, exchange: ExchangeRates): BomRow {
  const groups = new Map<string, CandidateListing[]>();
  for (const candidate of candidates.filter((c) => !c.rejectedReason)) {
    const key = productGroup(candidate);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  const options = [...groups.values()].map((group) => {
    const verified = verifyGroup(group, exchange);
    const sorted = [...group].sort((a,b) => (unitPrice(a, exchange) ?? Infinity) - (unitPrice(b, exchange) ?? Infinity));
    const pick = sorted.find((c) => c.evidence.some((e) => e.field === "price") && c.price) ?? sorted[0];
    const disqualified = verified.shipsToDestination.evidence.some((e) => e.value === false) || verified.stock.evidence.some((e) => e.value === "out") || (verified.leadTimeDays.max ?? 0) > input.deadlineDays;
    const specCount = Math.max(...group.map((c) => Object.keys(c.specsFound).filter((key) => key in part.keySpecs).length));
    const purchaseQuantity = Math.ceil(part.quantity / (pick.price?.qty ?? 1)) * (pick.price?.qty ?? 1);
    const price = (verified.price.max ?? verified.price.value ?? Infinity) as number;
    return { pick, verified, disqualified, specCount, purchaseQuantity, cost: price * purchaseQuantity };
  }).sort((a,b) => Number(a.disqualified) - Number(b.disqualified) || b.specCount - a.specCount || a.cost - b.cost || ((a.verified.leadTimeDays.max ?? Infinity) - (b.verified.leadTimeDays.max ?? Infinity)));
  const best = options[0];
  const verified = best?.verified ?? verifyGroup([], exchange);
  const needsQuote = part.category === "custom-fabricated" || verified.price.status === "unknown";
  return { part, ...(best ? { pick: best.pick, purchaseQuantity: best.purchaseQuantity } : {}), candidates, suppliers, fields: verified, status: needsQuote ? "unknown" : overallStatus(verified), needsQuote };
}
