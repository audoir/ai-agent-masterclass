import type { context } from "@opentelemetry/api";

// ─── Shared types for agent implementations ───────────────────────────────────

// Used by the orchestrator-pattern agents (researcher, writer, editor via MCP).
export type AgentInput = {
  readTopics: string[];
  writeTopic: string;
  instructions?: string;
};

export type McpToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

export type ParentContext = ReturnType<typeof context.active>;
