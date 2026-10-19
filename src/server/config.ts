import { z } from "zod";
const envSchema = z.object({
  MOCK: z.enum(["0", "1"]).default("1"),
  LLM_BASE_URL: z.url().default("https://api.groq.com/openai/v1"),
  LLM_API_KEY: z.string().default(""), LLM_MODEL: z.string().default("llama-3.3-70b-versatile"),
  PARALLEL_API_KEY: z.string().default(""), COMPOSIO_API_KEY: z.string().default(""),
  COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID: z.string().default(""),
  COMPOSIO_SHEETS_CONNECTED_ACCOUNT_ID: z.string().default(""),
  COMPOSIO_TOOL_VERSION: z.string().default("latest"),
});
export const config = () => envSchema.parse(process.env);
