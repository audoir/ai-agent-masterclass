import type Database from "better-sqlite3";
import type { ModelMessage } from "ai";
import { randomUUID } from "crypto";

// ─── Message shape stored in the JSON array ───────────────────────────────────
// Each element in chat_sessions.messages is one of these objects.
// The `id` is a short UUID (first 8 chars) used as a stable key for checkpointing.
export interface StoredMessage {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  created_at: string;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

export function getStoredMessages(db: Database.Database, sessionId: string): StoredMessage[] {
  const row = db
    .prepare("SELECT messages FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { messages: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.messages) as StoredMessage[];
  } catch {
    return [];
  }
}

function setStoredMessages(
  db: Database.Database,
  sessionId: string,
  messages: StoredMessage[],
): void {
  db.prepare(
    "UPDATE chat_sessions SET messages = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(messages), sessionId);
}

function appendMessage(
  db: Database.Database,
  sessionId: string,
  role: StoredMessage["role"],
  content: string,
  id?: string,
): StoredMessage {
  const messages = getStoredMessages(db, sessionId);
  const msg: StoredMessage = {
    id: id ?? randomUUID().slice(0, 8),
    role,
    content,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  messages.push(msg);
  setStoredMessages(db, sessionId, messages);
  return msg;
}

/**
 * Append a user message to the session's messages JSON array.
 * Creates the session row if it does not exist yet.
 * Returns the stored message object (including its generated id).
 */
export function appendUserMessage(
  db: Database.Database,
  sessionId: string,
  content: string,
  id?: string,
): StoredMessage {
  const existingSession = db
    .prepare("SELECT id FROM chat_sessions WHERE id = ?")
    .get(sessionId);
  if (!existingSession) {
    db.prepare("INSERT INTO chat_sessions (id) VALUES (?)").run(sessionId);
  }
  return appendMessage(db, sessionId, "user", content, id);
}

// ─── Convert stored messages to ModelMessage[] ────────────────────────────────

function storedMessagesToModelMessages(stored: StoredMessage[]): ModelMessage[] {
  const messages: ModelMessage[] = [];

  for (const m of stored) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content });
    } else if (m.role === "tool") {
      // Tool messages have JSON array content — wrap raw output as { type: "json", value }
      try {
        const parts = JSON.parse(m.content) as Array<{
          type: string;
          toolCallId: string;
          toolName: string;
          result?: unknown;
          output?: unknown;
        }>;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        messages.push({
          role: "tool",
          content: parts.map((p) => ({
            type: "tool-result" as const,
            toolCallId: p.toolCallId,
            toolName: p.toolName,
            output: { type: "json" as const, value: p.result ?? p.output ?? null },
          })),
        } as unknown as ModelMessage);
      } catch {
        // skip malformed rows
      }
    } else if (m.role === "assistant") {
      // Try to detect if this is a tool-call JSON blob
      try {
        const parsed = JSON.parse(m.content);
        if (parsed?.type === "tool-call") {
          // Merge consecutive tool-call parts into a single assistant message
          const last = messages[messages.length - 1];
          const toolCallPart = {
            type: "tool-call" as const,
            toolCallId: parsed.toolCallId,
            toolName: parsed.toolName,
            input: parsed.input,
          };
          if (
            last &&
            last.role === "assistant" &&
            Array.isArray(last.content)
          ) {
            (last.content as Array<unknown>).push(toolCallPart);
          } else {
            messages.push({ role: "assistant", content: [toolCallPart] });
          }
          continue;
        }
      } catch {
        // not JSON — fall through to plain text
      }
      messages.push({ role: "assistant", content: m.content });
    }
  }

  return messages;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initChatSession(
  db: Database.Database,
  sessionId: string,
  prompt?: string,
  messageId?: string,
): ModelMessage[] {
  const existingSession = db
    .prepare("SELECT id FROM chat_sessions WHERE id = ?")
    .get(sessionId);

  if (!existingSession) {
    db.prepare("INSERT INTO chat_sessions (id) VALUES (?)").run(sessionId);
  }

  if (prompt) {
    appendMessage(db, sessionId, "user", prompt, messageId);
  }

  const stored = getStoredMessages(db, sessionId);
  return storedMessagesToModelMessages(stored);
}

export function saveAssistantMessage(
  db: Database.Database,
  sessionId: string,
  text: string,
  messageId?: string,
): void {
  if (!text) return;
  appendMessage(db, sessionId, "assistant", text, messageId);
}

export function saveToolCallMessage(
  db: Database.Database,
  sessionId: string,
  toolCallId: string,
  toolName: string,
  input: unknown,
  messageId?: string,
): void {
  const content = JSON.stringify({
    type: "tool-call",
    toolCallId,
    toolName,
    input,
  });
  appendMessage(db, sessionId, "assistant", content, messageId);
}

export function saveToolResultMessage(
  db: Database.Database,
  sessionId: string,
  toolCallId: string,
  toolName: string,
  output: unknown
): void {
  const content = JSON.stringify({
    type: "tool-result",
    toolCallId,
    toolName,
    output,
  });
  appendMessage(db, sessionId, "assistant", content);
}

export function saveToolMessage(
  db: Database.Database,
  sessionId: string,
  toolCallId: string,
  toolName: string,
  output: unknown
): void {
  const content = JSON.stringify([
    {
      type: "tool-result",
      toolCallId,
      toolName,
      result: output,
    },
  ]);
  appendMessage(db, sessionId, "tool", content);
}

// ─── Checkpointing ────────────────────────────────────────────────────────────

// Shape of a single checkpoint entry stored in chat_sessions.checkpoints JSON array.
export interface StoredCheckpoint {
  message_id: string;
  messages_snapshot: StoredMessage[];
  topics_snapshot: Record<string, unknown>;
  created_at: string;
}

function getStoredCheckpoints(db: Database.Database, sessionId: string): StoredCheckpoint[] {
  const row = db
    .prepare("SELECT checkpoints FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { checkpoints: string } | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.checkpoints) as StoredCheckpoint[];
  } catch {
    return [];
  }
}

function setStoredCheckpoints(
  db: Database.Database,
  sessionId: string,
  checkpoints: StoredCheckpoint[]
): void {
  db.prepare(
    "UPDATE chat_sessions SET checkpoints = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(JSON.stringify(checkpoints), sessionId);
}

/**
 * Snapshot the current messages and key the checkpoint to a freshly generated
 * UUID (first 8 chars). Returns the generated id so callers can pass it on to
 * the message that will be written next — making the checkpoint id and the
 * upcoming message id the same value.
 *
 * Call this BEFORE writing any new messages.
 */
export function checkpointBeforeMessage(
  db: Database.Database,
  sessionId: string
): string {
  const messageId = randomUUID().slice(0, 8);
  saveCheckpoint(db, sessionId, messageId);
  return messageId;
}

/**
 * Save a checkpoint of the current messages JSON for a session,
 * keyed by `messageId` (a short UUID that will also be assigned to the next
 * message written after this checkpoint).
 *
 * Replaces any existing checkpoint with the same message_id (upsert by
 * filtering out the old entry and pushing the new one).
 */
export function saveCheckpoint(
  db: Database.Database,
  sessionId: string,
  messageId: string
): void {
  const row = db
    .prepare("SELECT messages, topics FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { messages: string; topics: string } | undefined;

  let messages: StoredMessage[] = [];
  let topics: Record<string, unknown> = {};
  if (row) {
    try { messages = JSON.parse(row.messages) as StoredMessage[]; } catch { /* empty */ }
    try { topics = JSON.parse(row.topics) as Record<string, unknown>; } catch { /* empty */ }
  }

  const checkpoints = getStoredCheckpoints(db, sessionId).filter(
    (cp) => cp.message_id !== messageId
  );
  checkpoints.push({
    message_id: messageId,
    messages_snapshot: messages,
    topics_snapshot: topics,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  setStoredCheckpoints(db, sessionId, checkpoints);
}

/**
 * Restore a session to the checkpoint associated with `messageId`.
 * Replaces the messages and topics JSON with the snapshots, then returns
 * the restored ModelMessage array.
 */
export function restoreCheckpoint(
  db: Database.Database,
  sessionId: string,
  messageId: string
): ModelMessage[] | null {
  const checkpoints = getStoredCheckpoints(db, sessionId);
  const checkpoint = checkpoints.find((cp) => cp.message_id === messageId);

  if (!checkpoint) return null;

  // Restore messages and topics from the snapshot.
  const restoredMessages: StoredMessage[] = checkpoint.messages_snapshot;
  db.prepare(
    "UPDATE chat_sessions SET messages = ?, topics = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(
    JSON.stringify(restoredMessages),
    JSON.stringify(checkpoint.topics_snapshot),
    sessionId,
  );

  return storedMessagesToModelMessages(restoredMessages);
}

/**
 * Return the set of message_ids that have a checkpoint for a session.
 * Used by the SSE route to tell the UI which messages have restore buttons.
 */
export function getCheckpointMessageIds(
  db: Database.Database,
  sessionId: string
): string[] {
  return getStoredCheckpoints(db, sessionId).map((cp) => cp.message_id);
}
