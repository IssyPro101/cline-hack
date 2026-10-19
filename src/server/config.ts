import { z } from "zod";
const envSchema = z.object({
  MOCK: z.enum(["0", "1"]).default("1"),
  DEMO_SCRIPT: z.enum(["0", "1"]).default("0"),
  WATCH_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(1)
    .max(604800)
    .default(86400),
  ANTHROPIC_API_KEY: z.string().trim().default(""),
  ANTHROPIC_MODEL: z.string().trim().min(1).default("claude-sonnet-5-5"),
  PARALLEL_API_KEY: z.string().default(""),
  COMPOSIO_API_KEY: z.string().default(""),
  COMPOSIO_SLACK_CONNECTED_ACCOUNT_ID: z.string().default(""),
  COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID: z.string().default(""),
  COMPOSIO_TOOL_VERSION: z.string().default("latest"),
});
export const config = () => envSchema.parse(process.env);
