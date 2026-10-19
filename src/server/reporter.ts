import type { Bom, BomRow, ExchangeRates, Risk, RunInput } from "../lib/schema";

export function report(runId: string, input: RunInput, rows: BomRow[], exchange: ExchangeRates, demo = false): Bom {
  const sum = (high: boolean) => Math.round(rows.reduce((total,row) => {
    if (row.needsQuote || row.fields.price.status === "unknown") return total;
    const p = row.fields.price;
    return total + Number(high ? p.max ?? p.value : p.min ?? p.value) * (row.purchaseQuantity ?? row.part.quantity);
  },0) * 100) / 100;
  const total = sum(false), totalMax = sum(true);
  const risks: Risk[] = [];
  for (const row of rows) {
    const { part, fields } = row;
    const add = (message: string, severity: Risk["severity"] = "warning") => risks.push({ partId: part.id, severity, message: `${part.name}: ${message}` });
    if (part.critical && Object.values(fields).some((f) => f.status === "single_source")) add("a critical component relies on a single source.");
    if (fields.stock.evidence.some((e) => e.value === "low")) add("limited stock. Confirm availability.");
    if (fields.stock.evidence.some((e) => e.value === "out")) add("reported out of stock.", "danger");
    if (fields.stock.status === "unknown" && !row.needsQuote) add("stock could not be verified.");
    if ((fields.leadTimeDays.max ?? 0) > input.deadlineDays) add(`delivery may take ${fields.leadTimeDays.max} days, beyond your ${input.deadlineDays}-day deadline.`, "danger");
    if (fields.leadTimeDays.status === "unknown" && !row.needsQuote) add("delivery time is unknown; the deadline cannot be confirmed.");
    if (fields.shipsToDestination.evidence.some((e) => e.value === false)) add(`supplier may not ship to ${input.shipTo}.`, "danger");
    if (fields.shipsToDestination.status === "unknown" && !row.needsQuote) add(`shipping to ${input.shipTo} is unverified.`);
    if (fields.price.status === "conflicting") add("sources disagree on price. The subtotal shows the full range.");
    if (row.needsQuote) add("needs a supplier quote; excluded from the subtotal.", "info");
    if ((row.purchaseQuantity ?? 0) > part.quantity) add(`sold in packs; subtotal includes ${row.purchaseQuantity} units for ${part.quantity} needed.`, "info");
    const missingSpecs = Object.keys(part.keySpecs).filter((key) => !row.pick?.specsFound[key]);
    if (row.pick && missingSpecs.length) add(`confirm unverified specifications: ${missingSpecs.join(", ")}.`);
  }
  if (totalMax > input.budget) risks.unshift({ severity: "danger", message: `Known parts exceed your ${input.currency} ${input.budget} budget by ${(totalMax - input.budget).toFixed(2)}, before shipping and unknown costs. These are the closest supported options.` });
  if (!rows.length) risks.push({ severity: "danger", message: "No bill of materials could be completed. Check the research errors and try again." });
  if (exchange.fallback) risks.push({ severity: "info", message: "Currency conversions use a fixed fallback table, not live rates. Subtotals are estimates; shipping and unknown tax are excluded." });
  return { runId, input, rows, total, totalMax, budgetRemaining: Math.round((input.budget - totalMax) * 100) / 100, quoteCount: rows.filter((r) => r.needsQuote).length, risks, exchange, createdAt: new Date().toISOString(), demo };
}
