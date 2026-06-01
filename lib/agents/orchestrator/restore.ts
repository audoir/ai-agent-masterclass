import { Database } from "better-sqlite3";
import { restoreCheckpoint, checkpointBeforeMessage, appendUserMessage } from "@/lib/chat-session";
import { runOrchestratorCore } from "./core";

// ─── Orchestrator Restore Agent ───────────────────────────────────────────────
//
// Restores a session to a saved checkpoint and re-runs the orchestrator from
// that point. Optionally injects a new user prompt after restoring.
//
// Steps:
//   1. restoreCheckpoint — trims the messages JSON back to the snapshot
//   2. (optional) checkpoint + insert a new user message if `prompt` is provided
//   3. Delegate to runOrchestratorCore for the shared pipeline
//
// The shared pipeline logic lives in core.ts.
// ─────────────────────────────────────────────────────────────────────────────

export async function runOrchestratorRestore({
  db,
  sessionId,
  messageId,
  prompt,
  userId,
  abortSignal,
}: {
  db: Database;
  sessionId: string;
  messageId: string;
  prompt?: string;
  userId: string;
  abortSignal?: AbortSignal;
}) {
  // Restore the session to the checkpoint before messageId.
  // This replaces the messages JSON with the snapshot and returns the
  // trimmed ModelMessage array.
  const restoredMessages = restoreCheckpoint(db, sessionId, messageId);
  if (!restoredMessages) {
    throw new Error(`No checkpoint found for session ${sessionId} at message ${messageId}`);
  }

  // If a new prompt was provided, checkpoint before inserting it (so the user
  // can roll back to before this new prompt too), then append it.
  if (prompt) {
    const messageId = checkpointBeforeMessage(db, sessionId);
    appendUserMessage(db, sessionId, prompt, messageId);
    restoredMessages.push({ role: "user", content: prompt });
  }

  return runOrchestratorCore({
    db,
    sessionId,
    userId,
    messages: restoredMessages,
    functionId: "orchestrator-restore",
    abortSignal,
  });
}
