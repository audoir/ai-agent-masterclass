import { streamText, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { propagation, context } from "@opentelemetry/api";
import { createMCPClient } from "@ai-sdk/mcp";
import { Database } from "better-sqlite3";
import { initChatSession, saveAssistantMessage, saveToolCallMessage, saveToolMessage } from "@/lib/chat-session";
import { DEFAULT_MODEL } from "@/lib/config";
import { mutatorOrchestratorSystemPrompt } from "@/lib/prompts/mutator-orchestrator";
import { makeTopicTools } from "./topic-tools";
import { mutatorTools } from "./mutator-tools";

// ─── Database Mutator Orchestrator ────────────────────────────────────────────
//
// Drives the database mutation pipeline using the topic system.
// System prompt lives in lib/prompts/mutator-orchestrator.ts.
//
// The database_mutator_agent reads from topics and writes its result to a topic:
//   readTopics:  database-mutation_vX  — the user's mutation request
//                user-approval_vX      — the human's approval ("true" / "false")
//   writeTopic:  mutation-result_vX    — the agent's result (always this name)
// ─────────────────────────────────────────────────────────────────────────────

export async function runMutatorOrchestrator({
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

  const traceCarrier: Record<string, string> = {};
  propagation.inject(context.active(), traceCarrier);

  const mutatorMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents/database-mutator/mcp",
      headers: { ...traceCarrier, "x-run-id": runId },
    },
  });

  const mcpAgentTools = await mutatorMcpClient.tools();
  const allTools = { ...makeTopicTools(runId), ...mutatorTools, ...mcpAgentTools };

  const toolSummary = Object.entries(allTools)
    .map(([name, t]) => `- **${name}**: ${(t as { description?: string }).description ?? ""}`)
    .join("\n");

  const systemPrompt = mutatorOrchestratorSystemPrompt(toolSummary);

  db.prepare("UPDATE chat_sessions SET system_prompt = ? WHERE id = ?").run(
    systemPrompt,
    runId,
  );

  return streamText({
    model: openai(DEFAULT_MODEL),
    system: systemPrompt,
    messages,
    stopWhen: stepCountIs(20),
    tools: allTools,
    experimental_telemetry: {
      isEnabled: true,
      functionId: "mutator-orchestrator",
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
      await mutatorMcpClient.close();
    },
  });
}
