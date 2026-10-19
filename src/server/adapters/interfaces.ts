import type { z } from "zod";
import type { Bom } from "../../lib/schema";
export type SearchHit = { url: string; title: string; excerpts: string[] };
export interface WebResearch {
  search(
    query: string,
    opts?: { country?: string; limit?: number },
  ): Promise<SearchHit[]>;
  extract(
    url: string,
    objective: string,
  ): Promise<{ text: string; fetchedAt: string }>;
}
export interface LLM {
  json<T>(args: {
    system: string;
    user: string;
    schema: z.ZodType<T>;
  }): Promise<T>;
}
export interface Drafts {
  createEmailDraft(args: {
    to?: string;
    subject: string;
    body: string;
  }): Promise<{ id: string; url?: string }>;
}
export interface Mail {
  createDraft(args:{to?:string;subject:string;body:string}):Promise<{id:string;threadId?:string;url?:string}>;
  listReplies?(args:{threadIds:string[]}):Promise<{threadId:string;from:string;receivedAt:string;text:string;url?:string}[]>;
}
export interface SheetsExport {
  exportBom(bom: Bom): Promise<{ url: string }>;
}
export interface WatchStore {
  save(bom: Bom): Promise<void>;
  getAll(): Promise<Bom[]>;
  getLast(bomId: string): Promise<Bom | null>;
}
export interface Notifier { notifySelf(text: string): Promise<{ url?: string }>; }
