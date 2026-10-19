import { describe, expect, it } from "vitest";
import { parseGmailThread } from "./gmail-thread";

const received = {
  messageId: "received-123", threadId: "thread-123", messageTimestamp: "2026-10-19T21:30:00+00:00",
  messageText: "USD 80.00 per unit. Delivery in 7 days.", preview: { body: "USD 80.00", subject: "Supplier quote" }, sender: "Supplier <quotes@supplier.example>", labelIds: ["INBOX"],
};
describe("live Composio Gmail normalization", () => {
  it("normalizes the observed messageId and ISO messageTimestamp response", () => {
    const replies = parseGmailThread({ threadId: "thread-123", messages: [received] }, "thread-123");
    expect(replies).toEqual([{ threadId: "thread-123", messageId: "received-123", from: received.sender, receivedAt: "2026-10-19T21:30:00.000Z", text: received.messageText, url: "https://mail.google.com/mail/u/0/#all/thread-123" }]);
  });
  it("excludes live drafts, sent, spam and trash before requiring reply metadata", () => {
    expect(parseGmailThread({ messages: ["DRAFT", "SENT", "SPAM", "TRASH"].map(label => ({ labelIds: [label], messageText: "Never ingest this" })) }, "thread-123")).toEqual([]);
    expect(parseGmailThread({ messages: [{ ...received, labelIds: ["DRAFT"] }] }, "thread-123")).toEqual([]);
  });
  it("still supports raw Gmail IDs, millisecond timestamps and MIME text", () => {
    const reply = parseGmailThread({ messages: [{ id: "raw-123", threadId: "thread-123", internalDate: String(Date.parse(received.messageTimestamp)), payload: { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: Buffer.from("USD 80.00").toString("base64url") } }], headers: [{ name: "From", value: received.sender }] } }] }, "thread-123")[0];
    expect(reply.messageId).toBe("raw-123");
    expect(reply.receivedAt).toBe("2026-10-19T21:30:00.000Z");
    expect(reply.text).toBe("USD 80.00");
  });
  it("does not infer a missing identity, timezone, date, body or sender", () => {
    const invalid = [
      { ...received, messageId: undefined },
      { ...received, messageTimestamp: undefined },
      { ...received, messageTimestamp: "yesterday" },
      { ...received, messageTimestamp: "2026-10-19T21:30:00" },
      { ...received, messageText: "", preview: "" },
      { ...received, sender: undefined },
      { ...received, id: "conflicting-id" },
    ];
    expect(parseGmailThread({ messages: invalid }, "thread-123")).toEqual([]);
  });
  it("never accepts another thread and isolates malformed messages", () => {
    expect(parseGmailThread({ threadId: "other", messages: [received] }, "thread-123")).toEqual([]);
    const replies = parseGmailThread({ messages: [{ ...received, threadId: "other" }, null, { labelIds: 123 }, received] }, "thread-123");
    expect(replies).toHaveLength(1);
  });
  it("orders received messages by normalized timestamps", () => {
    const replies = parseGmailThread({ messages: [received, { ...received, messageId: "earlier", messageTimestamp: "2026-10-18T21:30:00Z" }] }, "thread-123");
    expect(replies.map(reply => reply.messageId)).toEqual(["earlier", "received-123"]);
  });
});
