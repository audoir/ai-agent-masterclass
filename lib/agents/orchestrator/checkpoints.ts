import { Database } from "better-sqlite3";
import { initChatSession, checkpointBeforeMessage } from "@/lib/chat-session";
import { runOrchestratorCore } from "./core";

// ─── Orchestrator Agent (with Checkpointing) ─────────────────────────────────
//
// Drives a pipeline of 3 specialist sub-agents via MCP.
// Checkpoints the message state before each step so the user can roll back
// to any point in the conversation and rerun from there.
//
// The shared pipeline logic lives in core.ts.
// ─────────────────────────────────────────────────────────────────────────────

export async function runOrchestratorAgent({
  db,
  prompt,
  runId,
  userId,
  abortSignal,
}: {
  db: Database;
  prompt: string;
  runId: string;
  userId: string;
  abortSignal?: AbortSignal;
}) {
  // Checkpoint 0: snapshot the state BEFORE initChatSession writes the new
  // user message. The returned id is passed to initChatSession so the user
  // message gets the same id as the checkpoint
  const messageId = checkpointBeforeMessage(db, runId);

  const messages = initChatSession(db, runId, prompt, messageId);

  return runOrchestratorCore({
    db,
    sessionId: runId,
    userId,
    messages,
    functionId: "orchestrator-agent",
    abortSignal,
  });
}
