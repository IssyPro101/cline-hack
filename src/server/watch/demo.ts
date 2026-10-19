import type { Bom } from "../../lib/schema";
import { rankPart } from "../ranker";
import { report } from "../reporter";

export function scriptedCheck(baseline: Bom): Bom {
  const copy = structuredClone(baseline),
    cycle = baseline.watch?.cycle ?? 0;
  if (cycle % 3 === 2) {
    const custom = copy.rows.find(
      (r) => r.part.category === "custom-fabricated",
    );
    if (custom) {
      const now = new Date().toISOString(),
        url = `https://mail.partscout.example/thread/${custom.part.id}`,
        amount = 80 + (Math.floor(cycle / 3) % 2) * 10;
      custom.candidates.push({
        partId: custom.part.id,
        supplier: custom.suppliers[0]?.name ?? "Demo fabrication supplier",
        productName: custom.part.name,
        productKey: custom.part.id,
        productUrl: url,
        price: { amount, currency: "AUD", qty: 1 },
        leadTimeDays: 7,
        specsFound: {},
        quoteReceivedAt: now,
        quoteThreadId: `demo-${custom.part.id}`,
        quoteConditions: "Illustrative quote; no supplier email was received.",
        evidence: [
          {
            field: "price",
            value: amount,
            sourceType: "email_quote",
            sourceUrl: url,
            quote: `Scripted demo supplier reply: AUD ${amount.toFixed(2)} per unit.`,
            checkedAt: now,
            messageId: `demo-message-${cycle}`,
            supplierEmail: "quotes@fabrication.partscout.example",
          },
          {
            field: "leadTimeDays",
            value: 7,
            sourceType: "email_quote",
            sourceUrl: url,
            quote: "Scripted demo supplier reply: delivery in 7 days.",
            checkedAt: now,
            messageId: `demo-message-${cycle}`,
            supplierEmail: "quotes@fabrication.partscout.example",
          },
        ],
      });
    }
  }
  const row = copy.rows.find((r) => !r.needsQuote && r.candidates.length > 0);
  if (row)
    for (const listing of row.candidates) {
      if (listing.rejectedReason) continue;
      if (cycle % 3 === 0 && listing.price) {
        listing.price.amount =
          Math.round(listing.price.amount * 0.9 * 100) / 100;
        listing.evidence = listing.evidence.map((e) =>
          e.field === "price"
            ? {
                ...e,
                value: listing.price!.amount,
                quote: `Scripted demo: ${listing.price!.currency} ${listing.price!.amount.toFixed(2)} per ${listing.price!.qty} unit(s).`,
                checkedAt: new Date().toISOString(),
                sourceType: "web",
              }
            : e,
        );
      } else if (cycle % 3 === 1) {
        listing.stock = listing.stock === "low" ? "in_stock" : "low";
        listing.evidence = listing.evidence.map((e) =>
          e.field === "stock"
            ? {
                ...e,
                value: listing.stock!,
                quote: `Scripted demo: ${listing.stock === "low" ? "limited stock" : "in stock"}.`,
                checkedAt: new Date().toISOString(),
                sourceType: "web",
              }
            : e,
        );
      }
    }
  const rows = copy.rows.map((r) => ({
    ...rankPart(r.part, r.candidates, r.suppliers, copy.input, copy.exchange),
    drafts: r.drafts,
  }));
  return {
    ...report(copy.runId, copy.input, rows, copy.exchange, true),
    createdAt: baseline.createdAt,
  };
}
