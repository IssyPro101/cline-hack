import { runs, type StoredEvent } from "@/server/store";
import { startRun } from "@/server/runner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const run = runs.get((await context.params).id);
  if (!run)
    return Response.json(
      { error: "Run expired. Start a new search." },
      { status: 404 },
    );
  const after = Number(request.headers.get("last-event-id") || 0);
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      };
      const send = (entry: StoredEvent) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(
            `id: ${entry.id}\ndata: ${JSON.stringify(entry.event)}\n\n`,
          ),
        );
        if (entry.event.type === "run_finished") close();
      };
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 10000);
      cleanup = () => {
        clearInterval(heartbeat);
        run.listeners.delete(send);
        request.signal.removeEventListener("abort", close);
      };
      request.signal.addEventListener("abort", close, { once: true });
      run.listeners.add(send);
      run.events.filter((entry) => entry.id > after).forEach(send);
      if (run.finished) close();
      else void startRun(run).catch(() => close());
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
