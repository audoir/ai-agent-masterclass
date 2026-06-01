import { generateText, stepCountIs } from "ai";
import type { ModelMessage } from "ai";
import { openai } from "@ai-sdk/openai";
import type { Database } from "better-sqlite3";
import { propagation, context } from "@opentelemetry/api";
import { DEFAULT_MODEL } from "@/lib/config";
import {
  initChatSession,
  saveAssistantMessage,
  saveToolCallMessage,
  saveToolMessage,
} from "@/lib/chat-session";
import { SWARM_AGENT_CONFIG, type SwarmAgentName } from "./config";
import { registerAgent, setAgentSystemPrompt, finishAgent, failAgent } from "../agents/registry";
import { readTopic } from "../agents/topic-helpers";
import { buildWriteTopicTool, buildReadTopicTool, buildListTopicsTool, buildHandoffTool } from "./tools";
import type {
  SwarmAgentHandoffResult,
  SwarmAgentInput,
  SwarmAgentResult,
} from "./types";

// ─── Swarm Agent Runner ───────────────────────────────────────────────────────
//
// Builds and runs a single swarm agent turn.
//
// Each agent:
//   1. Looks up its system prompt and allowed handoffs from SWARM_AGENT_CONFIG
//   2. Loads the current message history (user + plain assistant text only)
//   3. Optionally injects readTopics content into the system prompt
//   4. Is given tools: write_topic(), read_topic(), list_topics(), handoff()
//   5. Calls generateText with the loaded message history
//   6. Persists tool calls, tool results, and the final assistant message to DB
//   7. Returns a SwarmAgentResult indicating whether to hand off or stop
//
// There is no "done" tool. The swarm loop ends when an agent responds with
// text without calling handoff.
//
// The caller (swarm controller) is responsible for the loop.
// ─────────────────────────────────────────────────────────────────────────────

export async function runSwarmAgent({
  db,
  runId,
  agentName,
  input,
  traceCarrier,
}: {
  db: Database;
  runId: string;
  agentName: SwarmAgentName;
  input: SwarmAgentInput;
  traceCarrier?: Record<string, string>;
}): Promise<SwarmAgentResult> {
  const config = SWARM_AGENT_CONFIG[agentName];

  // Register this agent invocation in the registry
  registerAgent(runId, agentName);

  // ── Load message history, keeping only plain user/assistant text ──────────
  // We exclude:
  //   - role='tool' messages (tool results)
  //   - role='assistant' messages whose content is an array (tool-call blobs)
  // This prevents the AI SDK from complaining about orphaned tool calls
  // and prevents the next agent from seeing the previous agent's tool interactions.
  const allMessages = initChatSession(db, runId);
  const messages: ModelMessage[] = allMessages.filter((m) => {
    if (m.role === "tool") return false;
    if (m.role === "assistant" && Array.isArray(m.content)) return false;
    return true;
  });

  // ── Build the system prompt ────────────────────────────────────────────────
  let systemPrompt = config.systemPrompt;

  // Inject readTopics content if the previous agent specified topics to read
  if (input.readTopics.length > 0) {
    const topicContents = input.readTopics
      .map((name) => {
        const content = readTopic(runId, name);
        return content ? `## Topic: ${name}\n\n${content}` : null;
      })
      .filter((c): c is string => c !== null)
      .join("\n\n---\n\n");

    if (topicContents) {
      systemPrompt += `\n\n---\n\n## Source Content (from previous agent)\n\n${topicContents}`;
    }
  }

  if (input.instructions.trim()) {
    systemPrompt += `\n\n---\n\n## Instructions\n\n${input.instructions.trim()}`;
  }

  setAgentSystemPrompt(runId, agentName, systemPrompt);

  // ── Capture handoff decision via callback ──────────────────────────────────
  let handoffDecision: SwarmAgentHandoffResult | undefined;

  const extra = config.extraTools ? await config.extraTools() : {};

  const tools = {
    ...extra,
    write_topic: buildWriteTopicTool({ runId, agentName }),
    read_topic: buildReadTopicTool({ runId }),
    list_topics: buildListTopicsTool({ runId }),
    handoff: buildHandoffTool({ agentName, onHandoff: (d) => { handoffDecision = d; } }),
  };

  // ── Restore OTel parent context from the swarm loop ───────────────────────
  // The swarm route creates a root "swarm-run" span and serializes it into
  // traceCarrier. We extract it here so this agent's generateText spans are
  // linked to that root span in Jaeger.
  const parentCtx = traceCarrier
    ? propagation.extract(context.active(), traceCarrier)
    : context.active();

  try {
    const result = await context.with(parentCtx, () => generateText({
      model: openai(DEFAULT_MODEL),
      system: systemPrompt,
      messages,
      stopWhen: stepCountIs(10),
      tools,
      experimental_telemetry: {
        isEnabled: true,
        functionId: `swarm-agent-${agentName}`,
        metadata: { runId, agentName },
      },
      onStepFinish: async ({ toolCalls, toolResults }) => {
        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls) {
            saveToolCallMessage(db, runId, toolCall.toolCallId, toolCall.toolName, toolCall.input);
          }
          for (const toolResult of toolResults ?? []) {
            saveToolMessage(db, runId, toolResult.toolCallId, toolResult.toolName, toolResult.output);
          }
        }
      },
    }));

    finishAgent(runId, agentName);

    if (handoffDecision) {
      // Agent called handoff — discard any text response to keep message history clean.
      // The handoff summary (stored in the tool-call blob) is what the user sees.
      return {
        type: "handoff",
        nextAgent: handoffDecision.nextAgent,
        summary: handoffDecision.summary,
        instructions: handoffDecision.instructions,
        readTopics: handoffDecision.readTopics,
      };
    }

    // Agent finished without calling handoff — this is the final response.
    // Persist the text so the user sees it in the chat.
    if (result.text) {
      saveAssistantMessage(db, runId, result.text);
    }

    return { type: "done", summary: result.text };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    failAgent(runId, agentName, errorMessage);
    throw err;
  }
}
