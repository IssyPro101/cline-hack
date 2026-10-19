import type { BomRow, RunInput, Supplier } from "../lib/schema";
export function rfqText(
  row: BomRow,
  input: RunInput,
  startedAt: number,
  supplier?: Supplier,
) {
  const deadline = new Date(
    startedAt + input.deadlineDays * 86400000,
  ).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return {
    subject: `PartScout RFQ: ${row.part.name} (qty ${row.part.quantity})${supplier ? ` — ${supplier.name}` : ""}`,
    body: `Hello${supplier ? ` ${supplier.name} team` : ""},\n\nCould you please provide a quote for the following part?\n\nPart: ${row.part.name}\nPurpose: ${row.part.purpose}\nQuantity: ${row.part.quantity}\n\nKey specifications:\n${Object.entries(
      row.part.keySpecs,
    )
      .map(([key, value]) => `• ${key}: ${value}`)
      .join(
        "\n",
      )}\n\nShip to: ${input.shipTo}\nNeeded by: ${deadline}\n\nPlease include unit and total pricing, currency, taxes, shipping cost, material/process recommendations, and estimated delivery time. Let me know which drawings or files you need before confirming the quote.\n\nThank you.`,
  };
}
