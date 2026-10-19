import type { CandidateListing, Evidence } from "../lib/schema";
const normalizeText = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();
export function quoteInText(quote: string | undefined, text: string): boolean {
  return Boolean(
    quote &&
    quote.trim().length >= 3 &&
    normalizeText(text).includes(normalizeText(quote)),
  );
}
function containsNumber(quote: string, value: number) {
  return [...quote.replace(/,/g, "").matchAll(/\d+(?:\.\d+)?/g)].some(
    (m) => Number(m[0]) === value,
  );
}
export function supportsEvidence(
  evidence: Evidence,
  listing: CandidateListing,
  destination: string,
) {
  const quote = evidence.quote?.toLowerCase() ?? "";
  if (evidence.field === "price") {
    if (
      !listing.price ||
      evidence.value !== listing.price.amount ||
      !containsNumber(quote, listing.price.amount)
    )
      return false;
    const markers: Record<string, RegExp> = {
      AUD: /\baud\b|a\$|au\$/,
      USD: /\busd\b|us\$/,
      EUR: /\beur\b|€/,
      GBP: /\bgbp\b|£/,
    };
    // A bare dollar sign is ambiguous; do not let the model choose a currency.
    if (!markers[listing.price.currency].test(quote)) return false;
    if (
      listing.price.qty !== 1 &&
      !new RegExp(
        `(?:pack|qty|quantity|set)\\D{0,8}${listing.price.qty}\\b|${listing.price.qty}[- ](?:pack|piece|unit)`,
      ).test(quote)
    )
      return false;
    // Tax stripping needs the rate on the same fetched quote, not a country guess.
    if (
      listing.price.includesTax &&
      listing.price.taxRate !== undefined &&
      (!/tax|gst|vat/.test(quote) ||
        !containsNumber(quote, Math.round(listing.price.taxRate * 100)))
    )
      return false;
    return true;
  }
  if (evidence.field === "stock") {
    const inStock = /\bin stock\b|available now|ready to ship/.test(quote);
    const out = /out of stock|sold out|unavailable|backorder|not in stock/.test(
      quote,
    );
    const low =
      /low stock|limited stock|only \d+ (?:left|remaining|in stock)/.test(
        quote,
      );
    return (
      evidence.value === listing.stock &&
      (evidence.value === "out"
        ? out
        : evidence.value === "low"
          ? low && !out
          : evidence.value === "in_stock"
            ? inStock && !out && !low
            : false)
    );
  }
  if (evidence.field === "leadTimeDays") {
    if (
      typeof evidence.value !== "number" ||
      evidence.value !== listing.leadTimeDays
    )
      return false;
    // Interpret the conservative upper end. Business days use 7/5 calendar-day conversion.
    const match = quote.match(
      /(\d+)(?:\s*[-–to]+\s*(\d+))?\s*(business days?|working days?|calendar days?|days?|weeks?)/,
    );
    if (!match || !/deliver|lead|dispatch|ship|arriv/.test(quote)) return false;
    const n = Number(match[2] ?? match[1]);
    const days = /week/.test(match[3])
      ? n * 7
      : /business|working/.test(match[3])
        ? Math.ceil((n * 7) / 5)
        : n;
    return days === evidence.value;
  }
  if (evidence.field === "shipsToDestination") {
    const locations = destination
      .toLowerCase()
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    if (
      !locations.some((location) => quote.includes(location)) &&
      !/worldwide|international shipping/.test(quote)
    )
      return false;
    if (!/ship|deliver/.test(quote)) return false;
    const negative =
      /does not ship|do not ship|cannot ship|no shipping|not available|except|exclud/.test(
        quote,
      );
    return (
      evidence.value === listing.shipsToDestination &&
      (evidence.value === false ? negative : !negative)
    );
  }
  return (
    typeof evidence.value === "string" &&
    normalizeText(quote).includes(normalizeText(evidence.value))
  );
}
export function groundListing(
  listing: CandidateListing,
  text: string,
  url: string,
  fetchedAt: string,
  destination: string,
): CandidateListing {
  const evidence = listing.evidence
    .filter(
      (e) =>
        quoteInText(e.quote, text) && supportsEvidence(e, listing, destination),
    )
    .map((e) => ({
      ...e,
      sourceType: "web" as const,
      sourceUrl: url,
      checkedAt: fetchedAt,
    }));
  const has = (field: Evidence["field"]) =>
    evidence.some((e) => e.field === field);
  return {
    ...listing,
    productUrl: url,
    evidence,
    price: has("price") ? listing.price : undefined,
    stock: has("stock") ? listing.stock : undefined,
    leadTimeDays: has("leadTimeDays") ? listing.leadTimeDays : undefined,
    shipsToDestination: has("shipsToDestination")
      ? listing.shipsToDestination
      : undefined,
    specsFound: Object.fromEntries(
      Object.entries(listing.specsFound).filter(([, value]) =>
        evidence.some((e) => e.field === "spec" && e.value === value),
      ),
    ),
  };
}
