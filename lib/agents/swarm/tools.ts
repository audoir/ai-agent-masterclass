import { tool } from "ai";
import { z } from "zod";
import { writeTopic, readTopic, listTopics } from "../agents/topic-helpers";
import { SWARM_AGENT_CONFIG, type SwarmAgentName } from "./config";
import type { SwarmAgentHandoffResult } from "./types";

// ─── Swarm Control Tools ──────────────────────────────────────────────────────
//
// Factory functions that build the control tools given to every swarm agent:
//   - buildWriteTopicTool  — persist output to a named topic slot in the DB
//   - buildReadTopicTool   — read a named topic from the DB
//   - buildListTopicsTool  — list all topics for the current run
//   - buildHandoffTool     — pass control to another agent
//
// Each factory captures the mutable decision variables via closure so the
// caller (runSwarmAgent) can read the decision after generateText resolves.
// ─────────────────────────────────────────────────────────────────────────────

export function buildWriteTopicTool({
  runId,
  agentName,
}: {
  runId: string;
  agentName: SwarmAgentName;
}) {
  return tool({
    description: "Write your output to the topic database under a name you choose.",
    inputSchema: z.object({
      topicName: z.string().describe('The name for this topic (e.g. "research_v0", "draft_v0", "final_v0").'),
      content: z.string().describe("The content to write to the topic."),
    }),
    execute: async ({ topicName, content }) => {
      writeTopic(runId, topicName, content, agentName);
      return `Wrote ${content.length} chars to topic "${topicName}".`;
    },
  });
}

export function buildReadTopicTool({ runId }: { runId: string }) {
  return tool({
    description: "Read the content of a named topic from the database. Use this to inspect what a previous agent wrote.",
    inputSchema: z.object({
      topicName: z.string().describe("The topic name to read."),
    }),
    execute: async ({ topicName }) => {
      const content = readTopic(runId, topicName);
      if (!content) return `Topic "${topicName}" does not exist.`;
      return content;
    },
  });
}

export function buildListTopicsTool({ runId }: { runId: string }) {
  return tool({
    description: "List all topics that exist for the current run, with their agent name and character count. Use this to understand what has already been produced.",
    inputSchema: z.object({}),
    execute: async () => {
      const rows = listTopics(runId);
      if (rows.length === 0) return "No topics found for this run.";
      return rows
        .map((r) => `- "${r.topic_name}" (${r.char_count} chars, written by ${r.agent_name})`)
        .join("\n");
    },
  });
}

export function buildHandoffTool({
  agentName,
  onHandoff,
}: {
  agentName: SwarmAgentName;
  onHandoff: (decision: SwarmAgentHandoffResult) => void;
}) {
  const config = SWARM_AGENT_CONFIG[agentName];

  return tool({
    description:
      "Hand off control to another agent. Call this when your work is done and another agent should continue.",
    inputSchema: z.object({
      agentName: z
        .enum(config.handoffs as [SwarmAgentName, ...SwarmAgentName[]])
        .describe(`The agent to hand off to. Allowed values: ${config.handoffs.join(", ")}`),
      summary: z
        .string()
        .describe(
          "A brief, conversational summary of what you did and why you are handing off. This will be shown to the user in the chat. Example: 'I researched the top electronics products and saved the findings. Handing off to the writer to draft a blog post.'",
        ),
      instructions: z
        .string()
        .describe(
          "Clear instructions for the next agent, including any relevant output from your work.",
        ),
      readTopics: z
        .array(z.string())
        .describe("Named topic slots the next agent should read its input from. Pass the topic names you wrote to so the next agent can read them."),
    }),
    execute: async ({ agentName: nextAgent, summary, instructions, readTopics }) => {
      onHandoff({
        nextAgent: nextAgent as SwarmAgentName,
        summary,
        instructions,
        readTopics,
      });
      return `Handing off to ${nextAgent}.`;
    },
  });
}
