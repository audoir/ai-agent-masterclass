import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getDb } from "@/lib/db/index";
import { getStoredMessages } from "@/lib/chat-session";
import { DEFAULT_MODEL } from "@/lib/config";
import { EPISODIC_MEMORY_SYSTEM_PROMPT, episodicMemoryUserPrompt } from "@/lib/prompts/episodic-memory";

// ─── Episodic Memory Agent ────────────────────────────────────────────────────
//
// Runs after a session completes (triggered via Next.js `after`).
//
// Reads the session's message history and existing episodic memories from
// chat_sessions.episodic_memories (a JSON array), calls the LLM to produce a
// new summary, then appends it to the array. The latest summary is always the
// last element.
// ─────────────────────────────────────────────────────────────────────────────

export interface EpisodicMemoryEntry {
  content: string;
  created_at: string;
}

function getSessionHistory(sessionId: string): string {
  const db = getDb();
  const messages = getStoredMessages(db, sessionId);

  if (messages.length === 0) return "(no messages found for this session)";

  return messages
    .map((m) => `[${m.created_at}] ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
}

function getEpisodicMemories(sessionId: string): EpisodicMemoryEntry[] {
  const db = getDb();
  const row = db
    .prepare("SELECT episodic_memories FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { episodic_memories: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.episodic_memories) as EpisodicMemoryEntry[];
  } catch {
    return [];
  }
}

function appendEpisodicMemory(sessionId: string, content: string): void {
  const db = getDb();
  const existing = getEpisodicMemories(sessionId);
  const entry: EpisodicMemoryEntry = {
    content,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  existing.push(entry);
  db.prepare(
    "UPDATE chat_sessions SET episodic_memories = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(existing), sessionId);
  console.log(`[episodic-memory] Appended entry #${existing.length} for sessionId=${sessionId}`);
}

function formatPastMemories(memories: EpisodicMemoryEntry[]): string {
  if (memories.length === 0) return "(no episodic memories recorded yet)";
  return memories
    .map((m, i) => `[entry ${i + 1} · ${m.created_at}]\n${m.content}`)
    .join("\n\n");
}

export async function runEpisodicMemoryAgent({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}): Promise<void> {
  const sessionHistory = getSessionHistory(sessionId);
  const pastMemories = formatPastMemories(getEpisodicMemories(sessionId));

  const result = await generateText({
    model: openai(DEFAULT_MODEL),
    system: EPISODIC_MEMORY_SYSTEM_PROMPT,
    prompt: episodicMemoryUserPrompt(userId, sessionId, sessionHistory, pastMemories),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "episodic-memory-agent",
      metadata: { userId, sessionId },
    },
  });

  appendEpisodicMemory(sessionId, result.text);
}
