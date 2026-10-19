import type { BomRow, RunInput } from "../lib/schema";
export function rfqText(row: BomRow, input: RunInput, startedAt: number) {
  const deadline = new Date(
    startedAt + input.deadlineDays * 86400000,
  ).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  return {
    subject: `Request for quote: ${row.part.name} (qty ${row.part.quantity})`,
    body: `Hello,\n\nCould you please provide a quote for the following part?\n\nPart: ${row.part.name}\nPurpose: ${row.part.purpose}\nQuantity: ${row.part.quantity}\n\nKey specifications:\n${Object.entries(
      row.part.keySpecs,
    )
      .map(([key, value]) => `• ${key}: ${value}`)
      .join(
        "\n",
      )}\n\nShip to: ${input.shipTo}\nNeeded by: ${deadline}\n\nPlease include unit and total pricing, currency, taxes, shipping cost, material/process recommendations, and estimated delivery time. Let me know which drawings or files you need before confirming the quote.\n\nThank you.`,
  };
}
