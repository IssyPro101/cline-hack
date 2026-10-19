import { z } from "zod";
import { bomCells } from "../../lib/format";
import { config } from "../config";
import type { Bom } from "../../lib/schema";
import type { Drafts, SheetsExport } from "./interfaces";

// Intentionally closed: the agent has no messaging/sending capability.
const allowedTools = ["GMAIL_CREATE_EMAIL_DRAFT", "GOOGLESHEETS_CREATE_GOOGLE_SHEET1", "GOOGLESHEETS_VALUES_UPDATE"] as const;
type AllowedTool = typeof allowedTools[number];
export class ComposioClient {
  async execute(tool: AllowedTool, account: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!allowedTools.includes(tool) || !account) throw new Error("This integration action is not configured.");
    const env = config();
    const response = await fetch(`https://backend.composio.dev/api/v3.1/tools/execute/${tool}`, {
      method: "POST", headers: { "x-api-key": env.COMPOSIO_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ connected_account_id: account, version: env.COMPOSIO_TOOL_VERSION, arguments: args }), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Composio returned HTTP ${response.status}. Your local draft and CSV are still available.`);
    const result = z.object({ successful: z.boolean(), data: z.unknown(), error: z.unknown().optional() }).parse(await response.json());
    if (!result.successful) throw new Error("The connected integration could not complete this action. Use the local draft or CSV.");
    return z.record(z.string(), z.unknown()).parse(typeof result.data === "string" ? JSON.parse(result.data) : result.data);
  }
}
export class ComposioDrafts implements Drafts {
  async createEmailDraft(args: { to?: string; subject: string; body: string }) {
    if (!args.to) throw new Error("A recipient email is required to save a Gmail draft. The copyable draft is ready below.");
    const data = await new ComposioClient().execute("GMAIL_CREATE_EMAIL_DRAFT", config().COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID, { recipient_email: args.to, subject: args.subject, body: args.body, is_html: false, user_id: "me" });
    const id = z.string().parse(data.draft_id ?? data.id);
    return { id, url: "https://mail.google.com/mail/u/0/#drafts" };
  }
}
export class ComposioSheets implements SheetsExport {
  async exportBom(bom: Bom) {
    const client = new ComposioClient(), account = config().COMPOSIO_SHEETS_CONNECTED_ACCOUNT_ID;
    const data = await client.execute("GOOGLESHEETS_CREATE_GOOGLE_SHEET1", account, { title: `PartScout — ${bom.input.goal.slice(0,80)}` });
    const nested = data.response_data && typeof data.response_data === "object" ? data.response_data as Record<string, unknown> : data;
    const id = z.string().min(1).parse(nested.spreadsheetId ?? nested.spreadsheet_id ?? nested.id);
    await client.execute("GOOGLESHEETS_VALUES_UPDATE", account, { spreadsheet_id: id, range: `A1:T${bom.rows.length + 1}`, values: bomCells(bom), value_input_option: "RAW", major_dimension: "ROWS" });
    return { url: `https://docs.google.com/spreadsheets/d/${encodeURIComponent(id)}/edit` };
  }
}
export class MockDrafts implements Drafts {
  async createEmailDraft() { return { id: "local-copyable-draft" }; }
}
export class MockSheets implements SheetsExport {
  async exportBom() { throw new Error("Sheets is offline in demo mode. Use Export CSV."); return { url: "" }; }
}
