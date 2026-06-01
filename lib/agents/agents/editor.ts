import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import { context, trace } from "@opentelemetry/api";
import { DEFAULT_MODEL } from "@/lib/config";
import { EDITOR_SYSTEM_PROMPT, editorUserPrompt } from "@/lib/prompts/editor";
import { readTopic, writeTopic, buildInstructionsNote } from "./topic-helpers";
import type { AgentInput, McpToolResult } from "./types";

const tracer = trace.getTracer("ai-agent-masterclass");

export const EDITOR_DESCRIPTION =
  'Reads one or more article drafts from the database (readTopics), reviews and improves them, and writes the result to writeTopic. Use `instructions` to give specific editing directives (e.g. "Make this shorter", "Improve the headline", "Add a call to action"). Can be called multiple times on the same topics to iteratively refine.';

export async function runEditorAgent(
  runId: string,
  { readTopics, writeTopic: writeTopicName, instructions }: AgentInput,
  parentContext: ReturnType<typeof context.active>,
): Promise<McpToolResult> {
  return context.with(parentContext, async () => {
    return tracer.startActiveSpan("editor_agent.run", async (agentSpan) => {
      try {
        const topicContents = readTopics.map((name) => readTopic(runId, name));
        const missingTopic = readTopics.find((_, i) => !topicContents[i]);
        if (missingTopic) {
          return {
            content: [{ type: "text" as const, text: `Error: Topic "${missingTopic}" for runId="${runId}" is empty.` }],
            isError: true,
          };
        }
        const draft = topicContents.join("\n\n");

        const result = await generateText({
          model: openai(DEFAULT_MODEL),
          system: EDITOR_SYSTEM_PROMPT,
          prompt: editorUserPrompt(draft) + buildInstructionsNote(instructions),
          experimental_telemetry: {
            isEnabled: true,
            functionId: "editor-agent",
            metadata: { runId },
          },
        });

        writeTopic(runId, writeTopicName, result.text, "editor_agent");

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
