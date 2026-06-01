import { streamText, stepCountIs, type ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import { propagation, context } from "@opentelemetry/api";
import { createMCPClient } from "@ai-sdk/mcp";
import { Database } from "better-sqlite3";
import {
  saveAssistantMessage,
  saveToolCallMessage,
  saveToolMessage,
  checkpointBeforeMessage,
} from "@/lib/chat-session";
import { DEFAULT_MODEL } from "@/lib/config";
import { orchestratorSystemPrompt } from "@/lib/prompts/orchestrator";
import { makeTopicTools } from "./topic-tools";

// ─── Orchestrator Core ────────────────────────────────────────────────────────
//
// Shared pipeline logic used by both the checkpointing orchestrator and the
// restore orchestrator. Callers are responsible for preparing the `messages`
// array (and any pre-run checkpointing) before calling this function.
//
// Parameters:
//   db         — SQLite database instance
//   sessionId  — the chat session / run id
//   userId     — the user who owns the session
//   messages   — the ModelMessage[] to pass to streamText
//   functionId — telemetry function id (e.g. "orchestrator-agent")
// ─────────────────────────────────────────────────────────────────────────────

export async function runOrchestratorCore({
  db,
  sessionId,
  userId,
  messages,
  functionId = "orchestrator-agent",
  abortSignal,
}: {
  db: Database;
  sessionId: string;
  userId: string;
  messages: ModelMessage[];
  functionId?: string;
  abortSignal?: AbortSignal;
}) {
  const traceCarrier: Record<string, string> = {};
  propagation.inject(context.active(), traceCarrier);

  const agentMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents/orchestrator/mcp",
      headers: { ...traceCarrier, "x-run-id": sessionId },
    },
  });

  const mcpAgentTools = await agentMcpClient.tools();
  const allTools = { ...makeTopicTools(sessionId), ...mcpAgentTools };

  const toolSummary = Object.entries(allTools)
    .map(([name, t]) => `- **${name}**: ${(t as { description?: string }).description ?? ""}`)
    .join("\n");

  const systemPrompt = orchestratorSystemPrompt(sessionId, toolSummary);

  db.prepare("UPDATE chat_sessions SET system_prompt = ? WHERE id = ?").run(
    systemPrompt,
    sessionId,
  );

  let messageId: string | undefined;
  return streamText({
    model: openai(DEFAULT_MODEL),
    system: systemPrompt,
    messages,
    stopWhen: stepCountIs(20),
    tools: allTools,
    // Forward the abort signal so the client's stop() call cancels the LLM
    // request immediately rather than waiting for the current step to finish.
    abortSignal,
    experimental_telemetry: {
      isEnabled: true,
      functionId,
      metadata: { sessionId },
    },
    experimental_onToolCallStart: async () => {
      // Checkpoint before each tool call execution
      // This captures the state before any tool execution modifies it
      messageId = checkpointBeforeMessage(db, sessionId);
    },
    onStepFinish: async ({ toolCalls, toolResults, text }) => {
      if (toolCalls && toolCalls.length > 0) {
        // Save tool call and result messages using the messageId from the checkpoint
        // created in experimental_onToolCallStart
        if (!messageId) {
          throw new Error("Message ID is required for tool call messages");
        }
        saveAssistantMessage(db, sessionId, text, messageId);
        for (const toolCall of toolCalls ?? []) {
          saveToolCallMessage(
            db,
            sessionId,
            toolCall.toolCallId,
            toolCall.toolName,
            toolCall.input,
            // messageId,
          );
        }
        // No checkpoint between tool call and tool result — they are atomic.
        for (const toolResult of toolResults ?? []) {
          saveToolMessage(
            db,
            sessionId,
            toolResult.toolCallId,
            toolResult.toolName,
            toolResult.output,
          );
        }
      }
    },
    onAbort: async () => {
      // When the client aborts the stream, close the MCP client to release
      // the connection. The DB state is already consistent because we only
      // write messages inside onStepFinish (which fires for completed steps).
      await agentMcpClient.close();
    },
    onFinish: async ({ text }) => {
      await agentMcpClient.close();
      // Checkpoint before the final assistant message so the user can roll
      // back to just before the assistant's reply and regenerate it.
      const messageId = checkpointBeforeMessage(db, sessionId);
      saveAssistantMessage(db, sessionId, text, messageId);
    },
  });
}
