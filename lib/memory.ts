import { runEpisodicMemoryAgent } from "@/lib/agents/agents/episodic-memory";
import { runSemanticMemoryAgent } from "@/lib/agents/agents/semantic-memory";

// ─── Long-Term Memory Coordinator ────────────────────────────────────────────
//
// Called after each orchestrator session finishes (via Next.js `after`).
// Responsible for:
//   1. Running the Episodic Memory Agent — generates a versioned summary of
//      what happened during the session and persists it to episodic_memories.
//   2. Running the Semantic Memory Agent — reads the new episodic memory and
//      the user's previous semantic memory, synthesises an updated fact-sheet,
//      and persists a new versioned row to semantic_memories.
// ─────────────────────────────────────────────────────────────────────────────

export async function updateLongTermMemory({
  userId,
  sessionId,
  finalText,
}: {
  userId: string;
  sessionId: string;
  finalText: string;
}): Promise<void> {
  console.log(
    `[memory] updateLongTermMemory — userId=${userId} sessionId=${sessionId} textLength=${finalText.length}`,
  );

  // 1. Episodic memory: summarise the session and store a versioned entry
  await runEpisodicMemoryAgent({ userId, sessionId });

  // 2. Semantic memory: synthesise the new episodic memory with the user's
  //    existing semantic memory to produce an updated fact-sheet
  await runSemanticMemoryAgent({ userId, sessionId });
}
