import { describe, it, expect } from "vitest";
import { mockEvents } from "../lib/demo";
import { ROBOT_GOAL } from "../lib/examples";
import type {
  Bom,
  RfqDraft,
  CandidateListing,
  AgentEvent,
} from "../lib/schema";
import type { MailReply } from "./adapters/interfaces";
import { MockLLM } from "./adapters/llm";
import { extractQuote, refreshQuotes, supplierSender } from "./quotes";
import { verifyField } from "./verifier";
import { diffBoms } from "./watch/diff";
import { parseGmailThread } from "./adapters/gmail-thread";
function fixture(): Bom {
  const e = mockEvents("test", {
    goal: ROBOT_GOAL,
    budget: 3500,
    currency: "AUD",
    shipTo: "Sydney, Australia",
    deadlineDays: 21,
    replay: false,
  }).at(-1)!;
  if (e.type !== "run_finished") throw new Error("Fixture");
  return e.bom;
}
const draft: RfqDraft = {
  id: "real-draft",
  threadId: "123abc",
  supplier: "Supplier",
  supplierUrl: "https://supplier.example",
  to: "quotes@supplier.example",
  subject: "Mount quote",
  body: "Fixture",
  mode: "gmail",
  createdAt: "2026-10-18T09:00:00.000Z",
};
const reply: MailReply = {
  threadId: "123abc",
  messageId: "abc123",
  from: "Supplier <quotes@supplier.example>",
  receivedAt: "2026-10-19T09:00:00.000Z",
  text: "For your mounting fixture: AUD 80.00 per unit. Delivery in 7 days. Excludes shipping.",
  url: "https://mail.google.com/mail/u/0/#all/123abc",
};
const llm = () =>
  new MockLLM({
    isQuoteForRequestedPart: true,
    price: { amount: 80, currency: "AUD", qty: 1, quote: "AUD 80.00 per unit" },
    leadTime: { days: 7, quote: "Delivery in 7 days" },
    conditions: "Excludes shipping.",
  });
describe("received supplier quote evidence", () => {
  it("matches a recorded thread and verified sender only", () => {
    expect(supplierSender(reply, draft)).toBe("quotes@supplier.example");
    expect(
      supplierSender({ ...reply, from: "attacker@other.example" }, draft),
    ).toBeUndefined();
    expect(
      supplierSender({ ...reply, threadId: "other" }, draft),
    ).toBeUndefined();
    expect(
      supplierSender({ ...reply, receivedAt: "2020-01-01T00:00:00Z" }, draft),
    ).toBeUndefined();
  });
  it("grounds received prices and lead times in the email text", async () => {
    const b = fixture(),
      row = b.rows.find((r) => r.needsQuote)!;
    const quote = await extractQuote(row, draft, reply, llm(), b.input.shipTo);
    expect(quote?.price?.amount).toBe(80);
    expect(quote?.leadTimeDays).toBe(7);
    expect(
      quote?.evidence.every(
        (e) => e.sourceType === "email_quote" && e.messageId === "abc123",
      ),
    ).toBe(true);
  });
  it("drops a made-up model price absent from received text", async () => {
    const b = fixture(),
      row = b.rows.find((r) => r.needsQuote)!;
    expect(
      await extractQuote(
        row,
        draft,
        { ...reply, text: "Please send drawings. No price is available." },
        llm(),
        b.input.shipTo,
      ),
    ).toBeNull();
  });
  it("takes quote precedence while retaining website values and independence", async () => {
    const b = fixture(),
      row = b.rows[0],
      quote = (await extractQuote(row, draft, reply, llm(), b.input.shipTo))!;
    const field = verifyField([row.candidates[0], quote], "price", b.exchange);
    expect(field.status).toBe("quoted");
    expect(field.value).toBe(80);
    expect(field.min).toBe(80);
    expect(field.max).toBe(80);
    expect(field.evidence.some((e) => e.value === 1699)).toBe(true);
    expect(field.sourceCount).toBe(2);
  });
  it("converts an unpriced custom part to quoted and includes it in the total", async () => {
    const b = fixture(),
      row = b.rows.find((r) => r.needsQuote)!;
    row.drafts = [draft];
    const events: AgentEvent[] = [];
    const updated = await refreshQuotes(
      b,
      {
        async createDraft() {
          return { id: "unused" };
        },
        async listReplies() {
          return [reply];
        },
      },
      llm(),
      (e) => events.push(e),
    );
    const quoted = updated.rows.find((r) => r.part.id === row.part.id)!;
    expect(quoted.status).toBe("quoted");
    expect(quoted.needsQuote).toBe(false);
    expect(updated.quoteCount).toBe(0);
    expect(updated.total).toBe(b.total + 80);
    expect(events.some((e) => e.type === "quote_extracted")).toBe(true);
    expect(diffBoms(b, updated).some((c) => c.field === "supplierQuote")).toBe(
      true,
    );
  });
  it("does not re-ingest the same email on the next cycle", async () => {
    const b = fixture(),
      row = b.rows.find((r) => r.needsQuote)!;
    row.drafts = [draft];
    const mail = {
      async createDraft() {
        return { id: "unused" };
      },
      async listReplies() {
        return [reply];
      },
    };
    const once = await refreshQuotes(b, mail, llm(), () => {}),
      events: AgentEvent[] = [];
    const twice = await refreshQuotes(once, mail, llm(), (e) => events.push(e));
    expect(events.filter((e) => e.type === "quote_extracted")).toHaveLength(0);
    expect(diffBoms(once, twice)).toHaveLength(0);
  });
  it("preserves existing BOM data after a Gmail failure", async () => {
    const b = fixture(),
      row = b.rows.find((r) => r.needsQuote)!;
    row.drafts = [draft];
    const events: AgentEvent[] = [];
    const updated = await refreshQuotes(
      b,
      {
        async createDraft() {
          return { id: "unused" };
        },
        async listReplies() {
          throw new Error("OAuth failed");
        },
      },
      llm(),
      (e) => events.push(e),
    );
    expect(updated.total).toBe(b.total);
    expect(updated.quoteCount).toBe(b.quoteCount);
    expect(events.some((e) => e.type === "error")).toBe(true);
  });
});
describe("Gmail received-thread parser", () => {
  it("decodes received plain text and rejects sent messages and drafts", () => {
    const message = {
      id: "abc",
      threadId: "123abc",
      internalDate: "1792400400000",
      payload: {
        mimeType: "text/plain",
        body: { data: Buffer.from("AUD 80.00 per unit").toString("base64url") },
        headers: [{ name: "From", value: "quotes@supplier.example" }],
      },
    };
    const replies = parseGmailThread(
      {
        messages: [
          message,
          { ...message, id: "sent", labelIds: ["SENT"] },
          { ...message, id: "draft", labelIds: ["DRAFT"] },
        ],
      },
      "123abc",
    );
    expect(replies).toHaveLength(1);
    expect(replies[0].text).toBe("AUD 80.00 per unit");
  });
});
