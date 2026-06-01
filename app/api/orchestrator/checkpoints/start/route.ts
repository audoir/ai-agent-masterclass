import { getDb } from "@/lib/db/index";
import { runOrchestratorAgent } from "@/lib/agents/orchestrator/checkpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Orchestrator Checkpoints API Route ──────────────────────────────────────
//
// POST /api/orchestrator/checkpoints/start
//
// Same as /api/orchestrator/default but uses the checkpointing variant of the
// orchestrator agent (lib/agents/orchestrator-checkpoints.ts) which calls
// checkpointBeforeMessage() before each step so every message boundary is
// snapshotted in session_checkpoints.
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

  const result = await runOrchestratorAgent({ db, prompt, runId, userId, abortSignal: req.signal });
  return result.toUIMessageStreamResponse();
}
