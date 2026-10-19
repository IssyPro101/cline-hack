import { getDomain } from "tldts";
import type { CandidateListing, Evidence, ExchangeRates, VerifiedField, VerificationStatus } from "../lib/schema";

export type Field = "price" | "stock" | "leadTimeDays" | "shipsToDestination";
export const fields: Field[] = ["price", "stock", "leadTimeDays", "shipsToDestination"];
export function sourceDomain(url: string) {
  try { const host = new URL(url).hostname.toLowerCase(); return getDomain(host, { allowPrivateDomains: true }) ?? host; } catch { return ""; }
}
export const identity = (value: string) => value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function productGroup(listing: CandidateListing) {
  return `${identity(listing.supplier)}::${identity(listing.productKey || listing.productName)}`;
}
export function unitPrice(listing: CandidateListing, exchange: ExchangeRates): number | undefined {
  const p = listing.price;
  if (!p || !Number.isFinite(p.amount) || p.amount < 0 || p.qty <= 0 || !exchange.rates[p.currency]) return undefined;
  const tax = p.includesTax === true && p.taxRate !== undefined ? 1 + p.taxRate : 1;
  return p.amount / p.qty / tax * exchange.rates[p.currency];
}
function supportedValue(listing: CandidateListing, field: Field, evidence: Evidence, exchange: ExchangeRates) {
  if (!evidence.quote || !sourceDomain(evidence.sourceUrl) || evidence.field !== field) return undefined;
  if (field === "price") return listing.price && evidence.value === listing.price.amount ? unitPrice(listing, exchange) : undefined;
  if (field === "stock") return listing.stock && listing.stock !== "unknown" && evidence.value === listing.stock ? listing.stock : undefined;
  if (field === "leadTimeDays") return typeof listing.leadTimeDays === "number" && evidence.value === listing.leadTimeDays ? listing.leadTimeDays : undefined;
  return typeof listing.shipsToDestination === "boolean" && evidence.value === listing.shipsToDestination ? listing.shipsToDestination : undefined;
}
export function verifyField(listings: CandidateListing[], field: Field, exchange: ExchangeRates): VerifiedField {
  const observations: { value: string | number | boolean; evidence: Evidence; domain: string }[] = [];
  for (const listing of listings.filter((l) => !l.rejectedReason)) for (const e of listing.evidence) {
    const value = supportedValue(listing, field, e, exchange);
    if (value !== undefined) observations.push({ value, evidence: e, domain: sourceDomain(e.sourceUrl) });
  }
  const independent = new Map<string, typeof observations[number]>();
  // Newest observation per registrable domain. Retain every quote in the returned evidence.
  observations.sort((a,b) => b.evidence.checkedAt.localeCompare(a.evidence.checkedAt)).forEach((o) => { if (!independent.has(o.domain)) independent.set(o.domain, o); });
  const values = [...independent.values()].map((o) => o.value);
  const evidence = observations.map((o) => o.evidence);
  if (!values.length) return { status: "unknown", evidence: [], sourceCount: 0 };
  let status: VerificationStatus = "single_source";
  const numeric = values.every((v) => typeof v === "number");
  const min = numeric ? Math.min(...values as number[]) : undefined;
  const max = numeric ? Math.max(...values as number[]) : undefined;
  if (values.length >= 2) {
    const agree = numeric ? field === "price" ? max! - min! <= Math.abs(min!) * 0.05 + 1e-9 : max! - min! <= 3 : values.every((v) => v === values[0]);
    status = agree ? "agreed" : "conflicting";
  }
  // Agreed numeric values use the observed median (never an invented mean).
  const sorted = numeric ? [...values as number[]].sort((a,b) => a-b) : [];
  return { status, value: numeric ? sorted[Math.floor((sorted.length-1)/2)] : values[0], ...(numeric ? { min, max } : {}), evidence, sourceCount: values.length };
}
export function verifyGroup(listings: CandidateListing[], exchange: ExchangeRates) {
  return Object.fromEntries(fields.map((field) => [field, verifyField(listings, field, exchange)])) as Record<Field, VerifiedField>;
}
export function overallStatus(verified: Record<Field, VerifiedField>): VerificationStatus {
  const statuses = Object.values(verified).map((v) => v.status);
  if (statuses.includes("conflicting")) return "conflicting";
  if (statuses.every((s) => s === "unknown")) return "unknown";
  if (statuses.includes("single_source") || statuses.includes("unknown")) return "single_source";
  return "agreed";
}
