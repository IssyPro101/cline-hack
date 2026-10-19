import type { Bom, BomRow, VerificationStatus } from "./schema";
export const statusLabels: Record<VerificationStatus, string> = {
  agreed: "Agreed",
  conflicting: "Conflicting",
  single_source: "Single source",
  quoted: "Quoted",
  unknown: "Needs quote",
};
export function money(value: number, currency = "AUD", compact = false) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: compact && Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}
export function priceLabel(row: BomRow, currency: string) {
  const field = row.fields.price;
  if (field.status === "unknown" || typeof field.value !== "number") return "—";
  return field.status === "conflicting"
    ? `${money(field.min!, currency, true)}–${money(field.max!, currency, true)}`
    : money(field.value, currency);
}
export function bomCells(bom: Bom): (string | number | boolean)[][] {
  return [
    [
      "Part",
      "Purpose",
      "Supplier",
      "Product",
      "Quantity",
      "Unit price low",
      "Unit price high",
      "Currency",
      "Price status",
      "Stock",
      "Stock status",
      "Lead days",
      "Lead status",
      "Ships to destination",
      "Shipping status",
      "Needs quote",
      "Evidence URLs",
      "Checked at",
      "Mode",
      "FX source",
    ],
    ...bom.rows.map((r) => [
      r.part.name,
      r.part.purpose,
      r.pick?.supplier ?? "",
      r.pick?.productName ?? "",
      r.part.quantity,
      r.fields.price.min ?? r.fields.price.value ?? "unknown",
      r.fields.price.max ?? r.fields.price.value ?? "unknown",
      bom.input.currency,
      r.fields.price.status,
      r.fields.stock.value ?? "unknown",
      r.fields.stock.status,
      r.fields.leadTimeDays.value ?? "unknown",
      r.fields.leadTimeDays.status,
      String(r.fields.shipsToDestination.value ?? "unknown"),
      r.fields.shipsToDestination.status,
      r.needsQuote ? "yes" : "no",
      [
        ...new Set(
          r.candidates.flatMap((c) => c.evidence.map((e) => e.sourceUrl)),
        ),
      ].join(" | "),
      [
        ...new Set(
          r.candidates.flatMap((c) => c.evidence.map((e) => e.checkedAt)),
        ),
      ].join(" | "),
      bom.demo ? "Illustrative demo" : "Live",
      bom.exchange.source,
    ]),
  ];
}
export function csvCell(value: string | number | boolean) {
  let text = String(value);
  if (/^[\s]*[=+@\-]/.test(text) || /^[\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCsv(bom: Bom) {
  return (
    "\uFEFF" +
    bomCells(bom)
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
