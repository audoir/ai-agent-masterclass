import { getDb } from "@/lib/db/index";
import { getStoredMessages } from "@/lib/chat-session";
import type { ChatMessageItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── GET /api/orchestrator/messages?sessionId=<id> ───────────────────────────
//
// Returns the user + assistant messages for a given session, filtered to
// exclude tool-call JSON payloads. Used by the Orchestrator chat panel to
// refresh the displayed history after a run completes.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return Response.json({ error: "sessionId is required" }, { status: 400 });
  }

  const db = getDb();
  const stored = getStoredMessages(db, sessionId);

  const messages: ChatMessageItem[] = stored
    .filter((m) => {
      if (m.role !== "user" && m.role !== "assistant") return false;
      if (m.role === "assistant") {
        try {
          const parsed = JSON.parse(m.content);
          if (parsed?.type === "tool-call") return false;
        } catch {
          // not JSON — keep it
        }
      }
      return true;
    })
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      created_at: m.created_at,
    }));

  return Response.json({ messages });
}
