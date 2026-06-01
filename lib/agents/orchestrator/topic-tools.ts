import { tool } from "ai";
import { z } from "zod";
import { readTopic, writeTopic, listTopics } from "../agents/topic-helpers";

// ─── Orchestrator Topic Tools ─────────────────────────────────────────────────
//
// Inline AI SDK tools for reading/writing named topics in the database.
// Used by the Orchestrator agent — avoids MCP round-trips for simple DB ops.
// ─────────────────────────────────────────────────────────────────────────────

export function makeTopicTools(runId: string) {
  return {
    write_topic: tool({
      description:
        "Write content directly to a named topic in the database. " +
        "Use this to seed custom content or store orchestrator notes. " +
        "Overwrites any existing content for that topic.",
      inputSchema: z.object({
        topicName: z.string().describe("The topic name to write to"),
        content: z.string().describe("The content to write"),
      }),
      execute: async ({ topicName, content }) => {
        writeTopic(runId, topicName, content, "orchestrator");
        return `Wrote ${content.length} chars to topic "${topicName}".`;
      },
    }),

    read_topic: tool({
      description:
        "Read the content of a named topic from the database. " +
        "Use this to inspect existing content before deciding which agent to call next.",
      inputSchema: z.object({
        topicName: z.string().describe("The topic name to read"),
      }),
      execute: async ({ topicName }) => {
        const content = readTopic(runId, topicName);
        if (!content) return `Topic "${topicName}" does not exist for this run.`;
        return content;
      },
    }),

    list_topics: tool({
      description:
        "List all topics that exist for the current run, with their agent name and character count. " +
        "Use this to understand what has already been produced before deciding what to do next.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = listTopics(runId);
        if (rows.length === 0) return `No topics found for this run.`;
        return rows
          .map((r) => `- "${r.topic_name}" (${r.char_count} chars, written by ${r.agent_name})`)
          .join("\n");
      },
    }),
  };
}
