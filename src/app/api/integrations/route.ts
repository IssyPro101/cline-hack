import { config } from "@/server/config";
export async function GET() {
  const env = config();
  return Response.json({
    mock: env.MOCK === "1",
    gmail:
      env.MOCK === "0" &&
      Boolean(env.COMPOSIO_API_KEY && env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID),
    sheets:
      env.MOCK === "0" &&
      Boolean(env.COMPOSIO_API_KEY && env.COMPOSIO_SHEETS_CONNECTED_ACCOUNT_ID),
  });
}
