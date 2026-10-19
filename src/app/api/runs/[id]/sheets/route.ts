import { runs } from "@/server/store";
import { config } from "@/server/config";
import { ComposioSheets } from "@/server/adapters/composio";
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const run = runs.get((await context.params).id);
  if (!run?.bom)
    return Response.json(
      { error: "A finished run is required." },
      { status: 404 },
    );
  const env = config();
  if (
    env.MOCK === "1" ||
    run.input.replay ||
    !env.COMPOSIO_API_KEY ||
    !env.COMPOSIO_SHEETS_CONNECTED_ACCOUNT_ID
  )
    return Response.json(
      {
        error:
          "Connect your Google Sheets account to export. CSV is always available.",
      },
      { status: 409 },
    );
  try {
    return Response.json(await new ComposioSheets().exportBom(run.bom));
  } catch {
    return Response.json(
      {
        error:
          "Sheets export could not finish. Check your connected account, or use CSV. An empty sheet may have been created.",
      },
      { status: 502 },
    );
  }
}
