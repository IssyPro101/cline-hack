// Migrate v1 cached evidence at the boundary; every emitted/persisted v2 value
// carries a source type, while old fixtures remain readable.
export function withEvidenceTypes<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withEvidenceTypes) as T;
  if (value && typeof value === "object") {
    const object = Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        withEvidenceTypes(item),
      ]),
    );
    if (
      "sourceUrl" in object &&
      "checkedAt" in object &&
      "field" in object &&
      "value" in object
    )
      object.sourceType ??= "web";
    return object as T;
  }
  return value;
}
