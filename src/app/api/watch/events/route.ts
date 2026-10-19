import { watchRuntime, startWatcher } from "@/server/watch/service";
import { subscribe } from "@/server/watch/events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  await startWatcher();
  const current = watchRuntime();
  const boms = await current.store.getAll();
  const status = await current.engine.status();
  const encoder = new TextEncoder();
  let cleanup = () => {};
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: unknown, id?: number) => {
        if (!closed)
          controller.enqueue(
            encoder.encode(
              `${id === undefined ? "" : `id: ${id}\n`}data: ${JSON.stringify(event)}\n\n`,
            ),
          );
      };
      const close = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {}
      };
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keep-alive\n\n"));
      }, 10000);
      send({ type: "watch_snapshot", boms });
      send(status);
      const last = request.headers.get("last-event-id");
      const unsubscribe = subscribe(
        ({ id, event }) => send(event, id),
        last ? Number(last) : undefined,
      );
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
        request.signal.removeEventListener("abort", close);
      };
      request.signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
