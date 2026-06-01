import { getDb } from "@/lib/db/index";
import type { TopicsMap } from "@/lib/agents/agents/topic-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Topics SSE Route ─────────────────────────────────────────────────────────
//
// GET /api/topics?runId=<runId>
//
// Opens a persistent SSE connection and pushes a snapshot of the topics JSON
// object from chat_sessions for the given run every second.
//
// Payload: { runId, topics: Record<string, { content, agentName, createdAt }> }
// ─────────────────────────────────────────────────────────────────────────────

function getTopicsSnapshot(runId: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT topics FROM chat_sessions WHERE id = ?")
    .get(runId) as { topics: string } | undefined;

  let topicsMap: TopicsMap = {};
  if (row) {
    try { topicsMap = JSON.parse(row.topics) as TopicsMap; } catch { /* empty */ }
  }

  // Convert to the shape the front-end expects: { [topicName]: { content, agentName, createdAt } }
  const topics: Record<string, { content: string; agentName: string; createdAt: string }> = {};
  for (const [topicName, entry] of Object.entries(topicsMap)) {
    topics[topicName] = {
      content: entry.content,
      agentName: entry.agent_name,
      createdAt: entry.created_at,
    };
  }

  return { runId, topics };
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
        send(getTopicsSnapshot(runId));
      } catch (err) {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)); } catch { /* already closed */ }
        controller.close();
        return;
      }

      // Then send updates every second
      intervalId = setInterval(() => {
        try {
          send(getTopicsSnapshot(runId));
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
