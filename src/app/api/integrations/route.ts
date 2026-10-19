import { config } from "@/server/config";
export async function GET() {
  const env = config();
  return Response.json({
    mock: env.MOCK === "1",
    gmail:
      env.MOCK === "0" &&
      Boolean(env.COMPOSIO_API_KEY && env.COMPOSIO_GMAIL_CONNECTED_ACCOUNT_ID),
    slack: Boolean(
      env.COMPOSIO_API_KEY && env.COMPOSIO_SLACK_CONNECTED_ACCOUNT_ID,
    ),
    demoScript: env.DEMO_SCRIPT === "1",
    watchIntervalSeconds: env.WATCH_INTERVAL_SECONDS,
  });
}
