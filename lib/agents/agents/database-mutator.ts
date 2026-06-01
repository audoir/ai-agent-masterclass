import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { context, trace } from "@opentelemetry/api";
import { DEFAULT_MODEL } from "@/lib/config";
import { DATABASE_MUTATOR_SYSTEM_PROMPT, databaseMutatorUserPrompt } from "@/lib/prompts/database-mutator";
import { readTopic, writeTopic, buildInstructionsNote } from "./topic-helpers";
import type { AgentInput, McpToolResult } from "./types";

const tracer = trace.getTracer("ai-agent-masterclass");

export const DATABASE_MUTATOR_DESCRIPTION =
  'Reads a mutation request from topics (readTopics: database-mutation_vX and optionally user-approval_vX), looks up existing records via the read MCP tools, then applies INSERT/UPDATE/DELETE operations via the update MCP tools. The writeTopic is always "mutation-result_vX". For INSERT: executes immediately if all fields are present. For UPDATE/DELETE: requires user-approval_vX = "true" in readTopics — if absent or "false", returns STATUS: fail describing what will change. Result always contains STATUS: success | fail, SUMMARY, and DETAILS.';

export async function runDatabaseMutatorAgent(
  runId: string,
  { readTopics, writeTopic: writeTopicName, instructions }: AgentInput,
  parentContext: ReturnType<typeof context.active>,
): Promise<McpToolResult> {
  return context.with(parentContext, async () => {
    return tracer.startActiveSpan("database_mutator_agent.run", async (agentSpan) => {
      try {
        const topicContents = readTopics.map((name) => readTopic(runId, name));
        const missingTopic = readTopics.find((_, i) => !topicContents[i]);
        if (missingTopic) {
          return {
            content: [{ type: "text" as const, text: `Error: Topic "${missingTopic}" for runId="${runId}" is empty.` }],
            isError: true,
          };
        }
        const topic = topicContents.join("\n\n");

        // Connect to both read and update MCP servers
        const readMcpClient = await createMCPClient({
          transport: { type: "http", url: "http://localhost:3000/api/mcp/database/read/mcp" },
        });
        const updateMcpClient = await createMCPClient({
          transport: { type: "http", url: "http://localhost:3000/api/mcp/database/update/mcp" },
        });

        const readTools = await readMcpClient.tools();
        const updateTools = await updateMcpClient.tools();
        const dbTools = { ...readTools, ...updateTools };

        const result = await generateText({
          model: openai(DEFAULT_MODEL),
          system: DATABASE_MUTATOR_SYSTEM_PROMPT,
          prompt: databaseMutatorUserPrompt(topic) + buildInstructionsNote(instructions),
          stopWhen: stepCountIs(15),
          tools: dbTools,
          experimental_telemetry: {
            isEnabled: true,
            functionId: "database-mutator-agent",
            metadata: { runId, topics: readTopics },
          },
          onFinish: async () => {
            await readMcpClient.close();
            await updateMcpClient.close();
          },
        });

        writeTopic(runId, writeTopicName, result.text, "database_mutator_agent");

        return {
          content: [{
            type: "text" as const,
            text: `Done. Read from ${JSON.stringify(readTopics)}, wrote ${result.text.length} chars to "${writeTopicName}".`,
          }],
        };
      } finally {
        agentSpan.end();
      }
    });
  });
}
