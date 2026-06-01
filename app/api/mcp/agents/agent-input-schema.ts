import { z } from "zod";

// ─── Shared Agent Input Schema ────────────────────────────────────────────────
//
// Used by all topic-aware agent MCP servers.
// Each agent reads from readTopics and writes its output to writeTopic.
// ─────────────────────────────────────────────────────────────────────────────

export const agentInputSchema = {
  readTopics: z.array(z.string()).describe('One or more topic names to read input from. All listed topics are read and concatenated as input.'),
  writeTopic: z.string().describe('The topic name to write output to.'),
  instructions: z.string().optional().describe('Optional additional instructions from the Orchestrator.'),
};
