import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { getDb } from "@/lib/db/index";
import { DEFAULT_MODEL } from "@/lib/config";
import { SEMANTIC_MEMORY_SYSTEM_PROMPT, semanticMemoryUserPrompt } from "@/lib/prompts/semantic-memory";

// ─── Semantic Memory Agent ────────────────────────────────────────────────────
//
// Runs after the Episodic Memory Agent completes (triggered via Next.js `after`).
//
// Reads the user's latest episodic memory (just written) and their previous
// semantic memory (if any), calls the LLM to synthesise an updated fact-sheet,
// then appends a new entry to users.semantic_memories (a JSON array).
// The latest entry is always the last element.
// ─────────────────────────────────────────────────────────────────────────────

export interface SemanticMemoryEntry {
  content: string;
  created_at: string;
}

function getLatestEpisodicMemory(sessionId: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT episodic_memories FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { episodic_memories: string } | undefined;

  if (!row) return "(no episodic memory found for this session)";
  try {
    const arr = JSON.parse(row.episodic_memories) as { content: string }[];
    if (arr.length > 0) return arr[arr.length - 1].content;
  } catch { /* fall through */ }
  return "(no episodic memory found for this session)";
}

function getSemanticMemories(userId: string): SemanticMemoryEntry[] {
  const db = getDb();
  const row = db
    .prepare("SELECT semantic_memories FROM users WHERE id = ?")
    .get(userId) as { semantic_memories: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.semantic_memories) as SemanticMemoryEntry[];
  } catch {
    return [];
  }
}

function getPreviousSemanticMemory(userId: string): string {
  const memories = getSemanticMemories(userId);
  if (memories.length === 0) return "(no previous semantic memory — this is the first session)";
  return memories[memories.length - 1].content;
}

function appendSemanticMemory(userId: string, content: string): void {
  const db = getDb();
  const existing = getSemanticMemories(userId);
  const entry: SemanticMemoryEntry = {
    content,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  existing.push(entry);
  db.prepare(
    "UPDATE users SET semantic_memories = ? WHERE id = ?",
  ).run(JSON.stringify(existing), userId);
  console.log(`[semantic-memory] Appended entry #${existing.length} for userId=${userId}`);
}

export async function runSemanticMemoryAgent({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}): Promise<void> {
  const newEpisodicMemory = getLatestEpisodicMemory(sessionId);
  const previousSemanticMemory = getPreviousSemanticMemory(userId);

  const result = await generateText({
    model: openai(DEFAULT_MODEL),
    system: SEMANTIC_MEMORY_SYSTEM_PROMPT,
    prompt: semanticMemoryUserPrompt(userId, previousSemanticMemory, newEpisodicMemory),
    experimental_telemetry: {
      isEnabled: true,
      functionId: "semantic-memory-agent",
      metadata: { userId, sessionId },
    },
  });

  appendSemanticMemory(userId, result.text);
}
