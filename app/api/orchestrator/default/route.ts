import { getDb } from "@/lib/db/index";
import { runOrchestratorAgent } from "@/lib/agents/orchestrator/default";
import type { TopicsMap } from "@/lib/agents/agents/topic-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Orchestrator API Route ───────────────────────────────────────────────────
//
// POST /api/orchestrator/default  — runs the orchestrator agent pipeline
// GET  /api/orchestrator/default  — SSE stream of agent topics for a given runId
//
// All agent logic lives in lib/agents/orchestrator.ts
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, runId, userId } = body as { prompt: string; runId: string; userId: string };

  if (!prompt || !runId || !userId) {
    return new Response(
      JSON.stringify({ error: "prompt, runId, and userId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = getDb();
  const session = db.prepare("SELECT id FROM chat_sessions WHERE id = ?").get(runId);
  if (!session) {
    db.prepare("INSERT OR IGNORE INTO chat_sessions (id, user_id) VALUES (?, ?)").run(runId, userId);
  }

  const result = await runOrchestratorAgent({ db, prompt, runId, userId });
  return result.toUIMessageStreamResponse();
}

// ─── Topics SSE ───────────────────────────────────────────────────────────────

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
