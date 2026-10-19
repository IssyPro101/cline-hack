import { z } from "zod";
import type { MailReply } from "./interfaces";
type Payload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: Payload[];
  headers?: { name: string; value: string }[];
};
function textParts(payload: Payload): string {
  const own =
    typeof payload.mimeType === "string" && payload.mimeType.startsWith("text/plain") && typeof payload.body?.data === "string"
      ? Buffer.from(payload.body.data, "base64url").toString("utf8")
      : "";
  return [own, ...(Array.isArray(payload.parts) ? payload.parts : []).filter(part => part && typeof part === "object").map(textParts)]
    .filter(Boolean)
    .join("\n");
}
const messageSchema = z.object({
  id: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  threadId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  internalDate: z.union([z.string(), z.number()]).optional(),
  messageTimestamp: z.union([z.string(), z.number()]).optional(),
  snippet: z.string().optional(),
  preview: z.unknown().optional(),
  payload: z.unknown().optional(),
  sender: z.string().optional(),
  messageText: z.string().optional(),
});
function receivedTime(value: string | number | undefined): Date | undefined {
  if (value === undefined || value === "") return;
  const milliseconds =
    typeof value === "number" || /^\d+$/.test(value)
      ? Number(value)
      : /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
        ? Date.parse(value)
        : NaN;
  const time = new Date(milliseconds);
  return Number.isFinite(time.getTime()) ? time : undefined;
}
export function parseGmailThread(
  data: Record<string, unknown>,
  threadId: string,
): MailReply[] {
  if (typeof data.threadId === "string" && data.threadId !== threadId)
    return [];
  const messages = z.array(z.unknown()).parse(data.messages ?? []);
  return messages
    .flatMap((raw) => {
      const parsed = messageSchema.safeParse(raw);
      if (!parsed.success) return [];
      const m = parsed.data;
      if (
        m.labelIds?.some((label) =>
          ["DRAFT", "SENT", "SPAM", "TRASH"].includes(label),
        )
      )
        return [];
      if (m.threadId && m.threadId !== threadId) return [];
      const id = m.id ?? m.messageId;
      if (!id || (m.id && m.messageId && m.id !== m.messageId)) return [];
      const payload = (m.payload && typeof m.payload === "object" ? m.payload : {}) as Payload;
      const from =
        (Array.isArray(payload.headers) ? payload.headers : []).find((h) => typeof h?.name === "string" && h.name.toLowerCase() === "from" && typeof h.value === "string")?.value ??
        m.sender;
      if (!from) return [];
      const time = receivedTime(m.internalDate ?? m.messageTimestamp);
      if (!time) return [];
      const preview = typeof m.preview === "string" ? m.preview : "";
      const text = textParts(payload) || m.messageText || m.snippet || preview;
      if (!text.trim()) return [];
      return [
        {
          threadId,
          messageId: id,
          from,
          receivedAt: time.toISOString(),
          text: text.slice(0, 16000),
          url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`,
        },
      ];
    })
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}
