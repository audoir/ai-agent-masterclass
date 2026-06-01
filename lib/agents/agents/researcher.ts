import { openai } from "@ai-sdk/openai";
import { generateText, stepCountIs } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { context, trace } from "@opentelemetry/api";
import { DEFAULT_MODEL } from "@/lib/config";
import { RESEARCHER_SYSTEM_PROMPT, researcherUserPrompt } from "@/lib/prompts/researcher";
import { readTopic, writeTopic, buildInstructionsNote } from "./topic-helpers";
import type { AgentInput, McpToolResult } from "./types";

const tracer = trace.getTracer("ai-agent-masterclass");

export const RESEARCHER_DESCRIPTION =
  'Reads one or more topics/prompts from the database (readTopics), queries the business database via MCP to gather data insights, and writes a structured research report to writeTopic. Use `instructions` to give specific research directives (e.g. "Focus only on electronics").';

export async function runResearcherAgent(
  runId: string,
  { readTopics, writeTopic: writeTopicName, instructions }: AgentInput,
  parentContext: ReturnType<typeof context.active>,
): Promise<McpToolResult> {
  return context.with(parentContext, async () => {
    return tracer.startActiveSpan("researcher_agent.run", async (agentSpan) => {
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

        const mcpClient = await createMCPClient({
          transport: { type: "http", url: "http://localhost:3000/api/mcp/database/read/mcp" },
        });
        const dbTools = await mcpClient.tools();

        const result = await generateText({
          model: openai(DEFAULT_MODEL),
          system: RESEARCHER_SYSTEM_PROMPT,
          prompt: researcherUserPrompt(topic) + buildInstructionsNote(instructions),
          stopWhen: stepCountIs(10),
          tools: dbTools,
          experimental_telemetry: {
            isEnabled: true,
            functionId: "researcher-agent",
            metadata: { runId, topics: readTopics },
          },
          onFinish: async () => { await mcpClient.close(); },
        });

        writeTopic(runId, writeTopicName, result.text, "researcher_agent");

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
