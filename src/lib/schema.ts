import { z } from "zod";

export const currencies = ["AUD", "USD", "EUR", "GBP"] as const;
export const statusSchema = z.enum(["agreed", "conflicting", "single_source", "unknown"]);
export const fieldSchema = z.enum(["price", "stock", "leadTimeDays", "shipsToDestination", "spec"]);
export const evidenceSchema = z.object({
  field: fieldSchema,
  value: z.union([z.string(), z.number().finite(), z.boolean()]),
  sourceUrl: z.url().refine((url) => /^https?:\/\//.test(url)),
  quote: z.string().max(1000).optional(),
  checkedAt: z.iso.datetime(),
});
export const partSchema = z.object({
  id: z.string().min(1).max(80), name: z.string().min(1).max(160),
  purpose: z.string().max(600), keySpecs: z.record(z.string(), z.string()),
  quantity: z.number().int().positive().max(10000),
  category: z.enum(["off-the-shelf", "custom-fabricated"]),
  critical: z.boolean().default(false),
});
export const listingSchema = z.object({
  partId: z.string(), supplier: z.string().min(1), productName: z.string().min(1),
  productUrl: z.url().refine((url) => /^https?:\/\//.test(url)),
  productKey: z.string().optional(),
  price: z.object({ amount: z.number().nonnegative().finite(), currency: z.enum(currencies), qty: z.number().positive(), includesTax: z.boolean().optional(), taxRate: z.number().min(0).max(1).optional() }).optional(),
  stock: z.enum(["in_stock", "low", "out", "unknown"]).optional(),
  leadTimeDays: z.number().nonnegative().finite().optional(),
  shipsToDestination: z.boolean().optional(), specsFound: z.record(z.string(), z.string()),
  evidence: z.array(evidenceSchema), rejectedReason: z.string().optional(),
});
export const supplierSchema = z.object({ name: z.string(), url: z.url(), evidence: z.array(evidenceSchema) });
export const verifiedFieldSchema = z.object({
  status: statusSchema, value: z.union([z.number(), z.string(), z.boolean()]).optional(),
  min: z.number().optional(), max: z.number().optional(),
  evidence: z.array(evidenceSchema), sourceCount: z.number().int(),
});
export const bomRowSchema = z.object({
  part: partSchema, pick: listingSchema.optional(), candidates: z.array(listingSchema),
  purchaseQuantity: z.number().int().positive().optional(),
  suppliers: z.array(supplierSchema),
  fields: z.object({ price: verifiedFieldSchema, stock: verifiedFieldSchema, leadTimeDays: verifiedFieldSchema, shipsToDestination: verifiedFieldSchema }),
  status: statusSchema, needsQuote: z.boolean(),
});
export const runInputSchema = z.object({
  goal: z.string().trim().min(10, "Describe your build in at least 10 characters.").max(3000),
  budget: z.number().positive().max(10000000), currency: z.enum(currencies).default("AUD"),
  shipTo: z.string().trim().min(2).max(150), deadlineDays: z.number().int().min(1).max(730),
  replay: z.boolean().default(false),
});
export const riskSchema = z.object({ partId: z.string().optional(), severity: z.enum(["warning", "danger", "info"]), message: z.string() });
export const exchangeSchema = z.object({
  base: z.enum(currencies), rates: z.record(z.string(), z.number().positive()),
  source: z.string(), checkedAt: z.iso.datetime(), fallback: z.boolean(),
});
export const bomSchema = z.object({
  runId: z.string(), input: runInputSchema, rows: z.array(bomRowSchema),
  total: z.number(), totalMax: z.number(), budgetRemaining: z.number(),
  quoteCount: z.number(), risks: z.array(riskSchema), exchange: exchangeSchema,
  createdAt: z.iso.datetime(), demo: z.boolean(),
});
export const agentEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run_started"), runId: z.string() }),
  z.object({ type: z.literal("question"), id: z.string(), text: z.string() }),
  z.object({ type: z.literal("assumption"), text: z.string() }),
  z.object({ type: z.literal("plan"), parts: z.array(partSchema).max(12) }),
  z.object({ type: z.literal("crawler_started"), partId: z.string() }),
  z.object({ type: z.literal("step"), partId: z.string(), label: z.string() }),
  z.object({ type: z.literal("listing"), listing: listingSchema }),
  z.object({ type: z.literal("part_result"), partId: z.string(), row: bomRowSchema }),
  z.object({ type: z.literal("part_needs_quote"), partId: z.string(), suppliers: z.array(supplierSchema) }),
  z.object({ type: z.literal("run_finished"), bom: bomSchema }),
  z.object({ type: z.literal("error"), partId: z.string().optional(), message: z.string() }),
]);
export type Evidence = z.infer<typeof evidenceSchema>;
export type PartRequirement = z.infer<typeof partSchema>;
export type CandidateListing = z.infer<typeof listingSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type VerifiedField = z.infer<typeof verifiedFieldSchema>;
export type VerificationStatus = z.infer<typeof statusSchema>;
export type BomRow = z.infer<typeof bomRowSchema>;
export type RunInput = z.infer<typeof runInputSchema>;
export type Bom = z.infer<typeof bomSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type ExchangeRates = z.infer<typeof exchangeSchema>;
export type Risk = z.infer<typeof riskSchema>;
