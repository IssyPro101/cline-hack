import { runs } from "@/server/store";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const run = runs.get((await context.params).id);
  if (!run?.finished || !run.bom)
    return Response.json(
      { error: "A finished run is required." },
      { status: 404 },
    );
  return Response.json({
    version: 1,
    illustrative: run.bom.demo,
    events: run.events.map(({ at, event }) => ({ at, event })),
  });
}
