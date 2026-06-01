import { getDb } from "@/lib/db/index";
import { runOrchestratorRestore } from "@/lib/agents/orchestrator/restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Orchestrator Restore API Route ──────────────────────────────────────────
//
// POST /api/orchestrator/checkpoints/restore
//
// Restores a session to a saved checkpoint and re-runs the orchestrator from
// that point. Optionally injects a new user prompt after restoring.
//
// Body: {
//   sessionId: string   — the chat session to restore
//   messageId: string   — the checkpoint message_id (short UUID) to restore to
//   userId:    string   — the user who owns the session
//   prompt?:   string   — optional new user message to inject after restoring
// }
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const body = await req.json();
  // Note: useCompletion always sends the first arg as `prompt` in the body.
  // We ignore that field and only use the `prompt` key from our custom body
  // object, which is only set when the user explicitly typed a new prompt.
  const { sessionId, messageId, userId, prompt: userPrompt } = body as {
    sessionId: string;
    messageId: string;
    userId: string;
    prompt?: string;
  };

  // Only treat prompt as real if it's a non-empty string that isn't the
  // placeholder "restore" value we pass to satisfy useCompletion's required arg.
  const prompt = userPrompt && userPrompt !== "restore" ? userPrompt : undefined;

  if (!sessionId || !messageId || !userId) {
    return new Response(
      JSON.stringify({ error: "sessionId, messageId, and userId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = getDb();

  // Verify the session exists
  const session = db.prepare("SELECT id FROM chat_sessions WHERE id = ?").get(sessionId);
  if (!session) {
    return new Response(
      JSON.stringify({ error: `Session ${sessionId} not found` }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  const result = await runOrchestratorRestore({ db, sessionId, messageId, prompt, userId, abortSignal: req.signal });
  return result.toUIMessageStreamResponse();
}
