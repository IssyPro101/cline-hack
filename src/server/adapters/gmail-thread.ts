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
    payload.mimeType?.startsWith("text/plain") && payload.body?.data
      ? Buffer.from(payload.body.data, "base64url").toString("utf8")
      : "";
  return [own, ...(payload.parts ?? []).map(textParts)]
    .filter(Boolean)
    .join("\n");
}
const messageSchema = z.object({
  id: z.string(),
  threadId: z.string().optional(),
  labelIds: z.array(z.string()).optional(),
  internalDate: z.union([z.string(), z.number()]),
  snippet: z.string().optional(),
  payload: z.unknown().optional(),
  sender: z.string().optional(),
  messageText: z.string().optional(),
});
export function parseGmailThread(
  data: Record<string, unknown>,
  threadId: string,
): MailReply[] {
  const messages = z.array(messageSchema).parse(data.messages ?? []);
  return messages
    .flatMap((m) => {
      if (
        m.labelIds?.some((label) =>
          ["DRAFT", "SENT", "SPAM", "TRASH"].includes(label),
        )
      )
        return [];
      if (m.threadId && m.threadId !== threadId) return [];
      const payload = (m.payload ?? {}) as Payload;
      const from =
        payload.headers?.find((h) => h.name.toLowerCase() === "from")?.value ??
        m.sender;
      if (!from) return [];
      const time = new Date(Number(m.internalDate));
      if (!Number.isFinite(time.getTime())) return [];
      const text = textParts(payload) || m.messageText || m.snippet || "";
      if (!text.trim()) return [];
      return [
        {
          threadId,
          messageId: m.id,
          from,
          receivedAt: time.toISOString(),
          text: text.slice(0, 16000),
          url: `https://mail.google.com/mail/u/0/#all/${encodeURIComponent(threadId)}`,
        },
      ];
    })
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}
