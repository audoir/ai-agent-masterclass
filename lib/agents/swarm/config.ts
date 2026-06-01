import type { Tool } from "ai";
import {
  SWARM_RESEARCHER_SYSTEM_PROMPT,
  SWARM_WRITER_SYSTEM_PROMPT,
  SWARM_EDITOR_SYSTEM_PROMPT,
} from "@/lib/prompts/swarm";

// ─── Swarm Topology Config ────────────────────────────────────────────────────
//
// Defines which agents each node in the swarm is allowed to hand off to,
// and the system prompt each agent runs with.
//
// There is no "entry" agent. The swarm always starts at "researcher".
// For follow-up prompts, the swarm resumes from the last agent that ran.
//
// Current topology:
//
//   researcher ──► writer
//
//   writer     ──► researcher
//   writer     ──► editor
//
//   editor     ──► researcher
//
// ─────────────────────────────────────────────────────────────────────────────

export type SwarmAgentName = "researcher" | "writer" | "editor";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool = Tool<any, any>;

export interface SwarmAgentConfig {
  systemPrompt: string;
  handoffs: SwarmAgentName[];
  /**
   * Optional factory that returns additional tools to give this agent.
   * Called at runtime so async tool setup (e.g. MCP clients) is supported.
   * The returned tools are merged with the standard control tools
   * (write_topic, read_topic, list_topics, handoff) before the agent runs.
   */
  extraTools?: () => Promise<Record<string, AnyTool>>;
}

export const SWARM_AGENT_CONFIG: Record<SwarmAgentName, SwarmAgentConfig> = {
  researcher: {
    systemPrompt: SWARM_RESEARCHER_SYSTEM_PROMPT,
    handoffs: ["writer"],
    // Researcher gets access to the business database via MCP
    extraTools: async () => {
      const { createMCPClient } = await import("@ai-sdk/mcp");
      const mcpClient = await createMCPClient({
        transport: { type: "http", url: "http://localhost:3000/api/mcp/database/read/mcp" },
      });
      return mcpClient.tools();
    },
  },
  writer: {
    systemPrompt: SWARM_WRITER_SYSTEM_PROMPT,
    handoffs: ["researcher", "editor"],
  },
  editor: {
    systemPrompt: SWARM_EDITOR_SYSTEM_PROMPT,
    handoffs: ["researcher"],
  },
};
