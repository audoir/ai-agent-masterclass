import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/index";
import type { EpisodicMemoryEntry } from "@/lib/agents/agents/episodic-memory";
import type { SemanticMemoryEntry } from "@/lib/agents/agents/semantic-memory";

export const runtime = "nodejs";

// ── GET /api/memory?userId=...&sessionId=... ─────────────────────────────────
// Returns episodic memories for a given userId, ordered newest first.
// Each item is the latest entry (last element) from the session's
// chat_sessions.episodic_memories JSON array.
//
// Optional: pass sessionId to restrict results to a single session.
// Also returns the user's semantic memories from users.semantic_memories JSON array.

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const sessionId = searchParams.get("sessionId");

  if (!userId) {
    return NextResponse.json(
      { error: "userId query parameter is required" },
      { status: 400 },
    );
  }

  const db = getDb();

  // Fetch sessions for this user that have episodic memories, optionally
  // filtered to a single session.
  const sessions = sessionId
    ? (db
        .prepare(
          `SELECT id, episodic_memories, created_at
           FROM chat_sessions
           WHERE user_id = ? AND id = ? AND episodic_memories != '[]'
           ORDER BY created_at DESC`,
        )
        .all(userId, sessionId) as {
        id: string;
        episodic_memories: string;
        created_at: string;
      }[])
    : (db
        .prepare(
          `SELECT id, episodic_memories, created_at
           FROM chat_sessions
           WHERE user_id = ? AND episodic_memories != '[]'
           ORDER BY created_at DESC`,
        )
        .all(userId) as {
        id: string;
        episodic_memories: string;
        created_at: string;
      }[]);

  // For each session, return the latest (last) entry from the array
  const episodic = sessions.flatMap((session) => {
    try {
      const arr = JSON.parse(session.episodic_memories) as EpisodicMemoryEntry[];
      if (arr.length === 0) return [];
      const latest = arr[arr.length - 1];
      return [{ session_id: session.id, content: latest.content, created_at: latest.created_at }];
    } catch {
      return [];
    }
  });

  // Fetch semantic memories from users.semantic_memories JSON array
  const userRow = db
    .prepare("SELECT semantic_memories FROM users WHERE id = ?")
    .get(userId) as { semantic_memories: string } | undefined;

  let semantic: SemanticMemoryEntry[] = [];
  if (userRow) {
    try {
      semantic = JSON.parse(userRow.semantic_memories) as SemanticMemoryEntry[];
      // Return newest first
      semantic = [...semantic].reverse();
    } catch { /* empty */ }
  }

  return NextResponse.json({
    userId,
    sessionId: sessionId ?? null,
    episodic,
    semantic,
  });
}
