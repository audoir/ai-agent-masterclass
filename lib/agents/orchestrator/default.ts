import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { propagation, context } from "@opentelemetry/api";
import { createMCPClient } from "@ai-sdk/mcp";
import { after } from "next/server";
import { Database } from "better-sqlite3";
import { initChatSession, saveAssistantMessage, saveToolCallMessage, saveToolMessage } from "@/lib/chat-session";
import { DEFAULT_MODEL } from "@/lib/config";
import { orchestratorSystemPrompt } from "@/lib/prompts/orchestrator";
import { updateLongTermMemory } from "@/lib/memory";
import { makeTopicTools } from "./topic-tools";
import { getPastEpisodicMemoriesForPrompt, getSemanticMemoryForPrompt } from "../agents/memory-utils";

// ─── Orchestrator Agent ───────────────────────────────────────────────────────
//
// Drives a pipeline of 3 specialist sub-agents via MCP.
// Each sub-agent reads/writes named topics in the database instead of passing
// large strings through the Orchestrator's context window.
//
// Topic utility tools (read_topic, write_topic, list_topics) are inline AI SDK
// tools — no MCP round-trip needed for simple DB helpers.
// Specialist sub-agents (researcher, writer, editor) remain as MCP tools.
// ─────────────────────────────────────────────────────────────────────────────

export async function runOrchestratorAgent({
  db,
  prompt,
  runId,
  userId,
}: {
  db: Database;
  prompt: string;
  runId: string;
  userId: string;
}) {
  const messages = initChatSession(db, runId, prompt);

  // Fetch past episodic memories for this user (excluding the current session)
  // to inject into the system prompt. The current session's messages are already
  // in the conversation context, so there's no need to summarise them again.
  const pastEpisodicMemories = getPastEpisodicMemoriesForPrompt(userId, runId);

  // Fetch the latest semantic memory (distilled user fact-sheet) for the prompt.
  const semanticMemory = getSemanticMemoryForPrompt(userId);

  // Serialize the current OTel context so the agent MCP server can restore the
  // parent span and produce a unified trace in Jaeger.
  const traceCarrier: Record<string, string> = {};
  propagation.inject(context.active(), traceCarrier);

  const agentMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents/orchestrator/mcp",
      headers: { ...traceCarrier, "x-run-id": runId },
    },
  });

  const mcpAgentTools = await agentMcpClient.tools();
  const allTools = { ...makeTopicTools(runId), ...mcpAgentTools };

  const toolSummary = Object.entries(allTools)
    .map(([name, t]) => `- **${name}**: ${(t as { description?: string }).description ?? ""}`)
    .join("\n");

  const systemPrompt = orchestratorSystemPrompt(runId, toolSummary, pastEpisodicMemories, semanticMemory);

  // Persist the system prompt so it can be inspected in the database view
  db.prepare(
    "UPDATE chat_sessions SET system_prompt = ? WHERE id = ?",
  ).run(systemPrompt, runId);

  return streamText({
    model: openai(DEFAULT_MODEL),
    system: systemPrompt,
    messages,
    stopWhen: stepCountIs(20),
    tools: allTools,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "orchestrator-agent",
      metadata: { runId },
    },
    onStepFinish: async ({ toolCalls, toolResults, text }) => {
      saveAssistantMessage(db, runId, text);
      if (toolCalls && toolCalls.length > 0) {
        for (const toolCall of toolCalls ?? []) {
          saveToolCallMessage(db, runId, toolCall.toolCallId, toolCall.toolName, toolCall.input);
        }
        for (const toolResult of toolResults ?? []) {
          saveToolMessage(db, runId, toolResult.toolCallId, toolResult.toolName, toolResult.output);
        }
      }
    },
    onFinish: async ({ text }) => {
      await agentMcpClient.close();

      after(() => updateLongTermMemory({ userId, sessionId: runId, finalText: text }));
    },
  });
}
