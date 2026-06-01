import { getDb } from "@/lib/db/index";

// ─── Topic Helpers ────────────────────────────────────────────────────────────
// Shared read/write utilities for the topics JSON field on chat_sessions.
// The `topics` column is a JSON object keyed by topic_name:
//   {
//     [topicName]: {
//       content:    string,
//       agent_name: string,
//       created_at: string,
//     }
//   }

export interface TopicEntry {
  content: string;
  agent_name: string;
  created_at: string;
}

export type TopicsMap = Record<string, TopicEntry>;

function getTopics(runId: string): TopicsMap {
  const db = getDb();
  const row = db
    .prepare("SELECT topics FROM chat_sessions WHERE id = ?")
    .get(runId) as { topics: string } | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.topics) as TopicsMap;
  } catch {
    return {};
  }
}

function setTopics(runId: string, topics: TopicsMap): void {
  const db = getDb();
  db.prepare(
    "UPDATE chat_sessions SET topics = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(topics), runId);
}

export function writeTopic(
  runId: string,
  topicName: string,
  content: string,
  agentName: string,
): void {
  const topics = getTopics(runId);
  topics[topicName] = {
    content,
    agent_name: agentName,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  };
  setTopics(runId, topics);
}

export function readTopic(runId: string, topicName: string): string | null {
  const topics = getTopics(runId);
  return topics[topicName]?.content ?? null;
}

export function listTopics(
  runId: string,
): { topic_name: string; agent_name: string; char_count: number }[] {
  const topics = getTopics(runId);
  return Object.entries(topics).map(([topic_name, entry]) => ({
    topic_name,
    agent_name: entry.agent_name,
    char_count: entry.content.length,
  }));
}

export function buildInstructionsNote(instructions?: string): string {
  if (!instructions?.trim()) return "";
  return `\n\n---\nAdditional instructions: ${instructions.trim()}\n---`;
}
