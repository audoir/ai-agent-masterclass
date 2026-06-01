import { getDb } from "@/lib/db/index";
import type { EpisodicMemoryEntry } from "./episodic-memory";

// ─── Memory Utilities ─────────────────────────────────────────────────────────
//
// Shared helpers for reading long-term memory from the database and formatting
// it for injection into agent system prompts.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the latest episodic memory entry for each of the user's past
 * sessions (excluding the current session), formatted as a readable string
 * ready for prompt injection.
 *
 * Episodic memories are stored as a JSON array in chat_sessions.episodic_memories.
 * The latest entry is the last element of the array.
 *
 * The current session is excluded because its full message history is already
 * present in the conversation context — summarising it again would be redundant.
 *
 * Returns `undefined` if the user has no memories from other sessions.
 */
export function getPastEpisodicMemoriesForPrompt(
  userId: string,
  currentSessionId: string,
): string | undefined {
  const db = getDb();

  // Fetch all sessions for this user except the current one that have memories
  const sessions = db
    .prepare(
      `SELECT id, episodic_memories, created_at
       FROM chat_sessions
       WHERE user_id = ? AND id != ? AND episodic_memories != '[]'
       ORDER BY created_at ASC`,
    )
    .all(userId, currentSessionId) as {
    id: string;
    episodic_memories: string;
    created_at: string;
  }[];

  // For each session, take the last (latest) entry from the array
  const entries: { sessionId: string; entry: EpisodicMemoryEntry }[] = [];
  for (const session of sessions) {
    try {
      const arr = JSON.parse(session.episodic_memories) as EpisodicMemoryEntry[];
      if (arr.length > 0) {
        entries.push({ sessionId: session.id, entry: arr[arr.length - 1] });
      }
    } catch {
      // skip malformed rows
    }
  }

  // Limit to the 5 most recent sessions
  const recent = entries.slice(-5);

  if (recent.length === 0) return undefined;

  return recent
    .map(
      ({ sessionId, entry }) =>
        `[Session ${sessionId} · ${entry.created_at}]\n${entry.content}`,
    )
    .join("\n\n");
}

/**
 * Returns the latest semantic memory for the user, formatted as a readable
 * string ready for prompt injection.
 *
 * Semantic memories are stored as a JSON array in users.semantic_memories.
 * The latest entry is the last element of the array.
 *
 * Returns `undefined` if the user has no semantic memory yet.
 */
export function getSemanticMemoryForPrompt(userId: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT semantic_memories FROM users WHERE id = ?")
    .get(userId) as { semantic_memories: string } | undefined;

  if (!row) return undefined;

  try {
    const arr = JSON.parse(row.semantic_memories) as { content: string; created_at: string }[];
    if (arr.length === 0) return undefined;
    const latest = arr[arr.length - 1];
    return `[Semantic Memory #${arr.length} · ${latest.created_at}]\n${latest.content}`;
  } catch {
    return undefined;
  }
}
