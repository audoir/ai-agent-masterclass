import type { SwarmAgentName } from "./config";

// ─── Swarm Agent Interface ────────────────────────────────────────────────────

// Input passed to each agent turn.
// readTopics — topics the previous agent wants this agent to read (empty for first turn).
// Each agent decides its own writeTopic via the write_topic tool.
export type SwarmAgentInput = {
  instructions: string;
  readTopics: string[];
};

// What the handoff tool captures and returns to the swarm loop.
// The handing-off agent specifies which topics the next agent should read.
// The next agent decides its own writeTopic.
export type SwarmAgentHandoffResult = {
  nextAgent: SwarmAgentName;
  summary: string;
  instructions: string;
  readTopics: string[];
};

export type SwarmAgentResult =
  | (SwarmAgentHandoffResult & { type: "handoff" })
  | { type: "done"; summary: string };
