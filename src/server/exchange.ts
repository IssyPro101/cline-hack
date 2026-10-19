import type { ExchangeRates, RunInput } from "../lib/schema";
// Deliberately fixed: these are not market quotes. Each run and export labels this fallback.
const USD_PER_UNIT = { USD: 1, AUD: 0.65, EUR: 1.08, GBP: 1.27 };
export function exchangeRates(currency: RunInput["currency"]): ExchangeRates {
  return { base: currency, rates: Object.fromEntries(Object.entries(USD_PER_UNIT).map(([key, rate]) => [key, rate / USD_PER_UNIT[currency]])), source: "Fixed fallback FX table (USD: AUD 0.65, EUR 1.08, GBP 1.27); estimates, not live rates", checkedAt: new Date().toISOString(), fallback: true };
}
