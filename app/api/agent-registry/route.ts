import { getAgentRegistry, getRunStatus } from "@/lib/agents/agents/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Agent Registry SSE Route ─────────────────────────────────────────────────
//
// GET /api/agent-registry?runId=<runId>
//
// Opens a persistent SSE connection and pushes a snapshot of the agent_registry
// table for the given run every second. The payload includes:
//   - runId      — the run being observed
//   - status     — overall run status: 'running' | 'done' | 'error' | null
//   - agents     — ordered list of agent entries for the run
//
// Clients can use this stream to render a live swarm status panel without
// polling. The stream stays open until the client disconnects.
// ─────────────────────────────────────────────────────────────────────────────

function getRegistrySnapshot(runId: string) {
  const agents = getAgentRegistry(runId);
  const status = getRunStatus(runId);
  return { runId, status, agents };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return new Response(
      JSON.stringify({ error: "runId query parameter is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Send initial snapshot immediately
      try {
        send(getRegistrySnapshot(runId));
      } catch (err) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`),
          );
        } catch { /* already closed */ }
        controller.close();
        return;
      }

      // Then push updates every second
      intervalId = setInterval(() => {
        try {
          send(getRegistrySnapshot(runId));
        } catch {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }
      }, 1000);
    },
    cancel() {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
