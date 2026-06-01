import { tool } from "ai";
import { z } from "zod";

// ─── Mutator Orchestrator Tools ───────────────────────────────────────────────
//
// Inline AI SDK tools specific to the Database Mutator Orchestrator.
// Used alongside topicTools from topic-tools.ts.
// ─────────────────────────────────────────────────────────────────────────────

export const mutatorTools = {
  request_human_approval: tool({
    description:
      "Stop execution and present a confirmation question to the user for a destructive UPDATE or DELETE operation. " +
      "This tool does NOT write to any topic. " +
      "After calling this tool, stop and wait for the user's reply. " +
      "On the next turn, call database_mutator_agent with the updated readTopics (including user-approval_vX = 'true' or 'false') and writeTopic='mutation-result_vX'.",
    inputSchema: z.object({
      action_summary: z
        .string()
        .describe("A clear description of exactly what records will be modified or deleted."),
      question_for_human: z
        .string()
        .describe(
          "The confirmation question to present to the user (e.g. 'Do you want to proceed with deleting these 3 records?').",
        ),
    }),
    execute: async ({ action_summary, question_for_human }) => {
      return JSON.stringify({
        status: "awaiting_human_approval",
        action_summary,
        question_for_human,
        instructions:
          "Present the question_for_human to the user and stop. " +
          "On the next turn, call database_mutator_agent with readTopics including user-approval_vX " +
          "('true' if approved, 'false' if rejected) and writeTopic='mutation-result_vX'.",
      });
    },
  }),
};
