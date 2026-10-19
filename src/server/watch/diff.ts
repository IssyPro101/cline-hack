import { randomUUID } from "node:crypto";
import type { Bom, Change, VerifiedField } from "../../lib/schema";

const label = (field: VerifiedField) =>
  field.status === "unknown"
    ? "unknown"
    : field.status === "conflicting" && field.min !== undefined
      ? `${field.min}–${field.max} (${field.status})`
      : `${field.value ?? "unknown"} (${field.status})`;
export function diffBoms(
  before: Bom,
  after: Bom,
  now = new Date().toISOString(),
): Change[] {
  const changes: Change[] = [];
  for (const row of after.rows) {
    const old = before.rows.find((r) => r.part.id === row.part.id);
    if (!old) continue;
    const oldQuotes = new Set(
      old.candidates.flatMap((c) =>
        c.evidence
          .filter((e) => e.sourceType === "email_quote")
          .map((e) => e.messageId),
      ),
    );
    const fresh = row.candidates.flatMap((c) =>
      c.evidence.filter(
        (e) =>
          e.sourceType === "email_quote" &&
          e.messageId &&
          !oldQuotes.has(e.messageId),
      ),
    );
    if (fresh.length)
      changes.push({
        id: randomUUID(),
        bomId: after.runId,
        partId: row.part.id,
        partName: row.part.name,
        field: "supplierQuote",
        oldValue: "No matching received quote",
        newValue: `Supplier quote received (${[...new Set(fresh.map((e) => e.messageId))].length} email)`,
        evidenceUrl: fresh[0].sourceUrl,
        detectedAt: now,
        demo: after.demo,
      });
    for (const key of [
      "price",
      "stock",
      "leadTimeDays",
      "shipsToDestination",
    ] as const) {
      const a = old.fields[key],
        b = row.fields[key];
      let material = a.status !== b.status;
      if (a.status !== "unknown" && b.status !== "unknown") {
        if (key === "price" || key === "leadTimeDays") {
          const pairs: [[unknown, unknown], [unknown, unknown]] = [
            [a.min ?? a.value, b.min ?? b.value],
            [a.max ?? a.value, b.max ?? b.value],
          ];
          material ||= pairs.some(
            ([x, y]) =>
              typeof x === "number" &&
              typeof y === "number" &&
              (key === "price"
                ? Math.abs(y - x) > Math.abs(x) * 0.05 + 1e-9
                : Math.abs(y - x) > 3),
          );
        } else material ||= a.value !== b.value;
      }
      if (material)
        changes.push({
          id: randomUUID(),
          bomId: after.runId,
          partId: row.part.id,
          partName: row.part.name,
          field: key,
          oldValue: label(a),
          newValue: label(b),
          evidenceUrl: b.evidence[0]?.sourceUrl,
          detectedAt: now,
          demo: after.demo,
        });
    }
  }
  return changes;
}
