import { getDb } from "@/lib/db/index";
import { getCheckpointMessageIds } from "@/lib/chat-session";
import type { StoredMessage } from "@/lib/chat-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Checkpoints SSE Route ────────────────────────────────────────────────────
//
// GET /api/checkpoints?sessionId=<sessionId>
//
// Opens a persistent SSE connection and pushes a snapshot of the
// messages JSON array for the given session every second.
// Payload: { sessionId, messages: StoredMessage[], checkpointMessageIds: string[] }
// ─────────────────────────────────────────────────────────────────────────────

function getMessagesSnapshot(sessionId: string) {
  const db = getDb();
  const row = db
    .prepare("SELECT messages FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { messages: string } | undefined;

  let messages: StoredMessage[] = [];
  if (row) {
    try {
      messages = JSON.parse(row.messages) as StoredMessage[];
    } catch {
      messages = [];
    }
  }

  // Collect the set of message_ids that have a checkpoint so the UI can
  // render interactive restore buttons on those messages.
  const checkpointMessageIds = getCheckpointMessageIds(db, sessionId);
  return { sessionId, messages, checkpointMessageIds };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "sessionId query parameter is required" }),
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
        send(getMessagesSnapshot(sessionId));
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
          send(getMessagesSnapshot(sessionId));
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
