import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { context, trace } from "@opentelemetry/api";
import { DEFAULT_MODEL } from "@/lib/config";
import { WRITER_SYSTEM_PROMPT, writerUserPrompt } from "@/lib/prompts/writer";
import { readTopic, writeTopic, buildInstructionsNote } from "./topic-helpers";
import type { AgentInput, McpToolResult } from "./types";

const tracer = trace.getTracer("ai-agent-masterclass");

export const WRITER_DESCRIPTION =
  'Reads research notes from one or more topics in the database (readTopics) and writes an engaging blog post draft to writeTopic. Use `instructions` to give specific writing directives (e.g. "Write in a casual tone" or "Keep it under 500 words").';

export async function runWriterAgent(
  runId: string,
  { readTopics, writeTopic: writeTopicName, instructions }: AgentInput,
  parentContext: ReturnType<typeof context.active>,
): Promise<McpToolResult> {
  return context.with(parentContext, async () => {
    return tracer.startActiveSpan("writer_agent.run", async (agentSpan) => {
      try {
        const topicContents = readTopics.map((name) => readTopic(runId, name));
        const missingTopic = readTopics.find((_, i) => !topicContents[i]);
        if (missingTopic) {
          return {
            content: [{ type: "text" as const, text: `Error: Topic "${missingTopic}" for runId="${runId}" is empty.` }],
            isError: true,
          };
        }
        const research = topicContents.join("\n\n");

        const result = await generateText({
          model: openai(DEFAULT_MODEL),
          system: WRITER_SYSTEM_PROMPT,
          prompt: writerUserPrompt("the topic described in the research notes", research) + buildInstructionsNote(instructions),
          experimental_telemetry: {
            isEnabled: true,
            functionId: "writer-agent",
            metadata: { runId },
          },
        });

        writeTopic(runId, writeTopicName, result.text, "writer_agent");

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
