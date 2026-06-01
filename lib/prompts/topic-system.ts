// ── Topic System Explanation ──────────────────────────────────────────────────
//
// This module exports a shared explanation of how the topic system works.
// It is injected into every orchestrator's system prompt so the model has a
// consistent, authoritative understanding of the rules.
//
// Import and embed this in any orchestrator prompt:
//   import { TOPIC_SYSTEM_PROMPT } from "@/lib/prompts/topic-system";
// ─────────────────────────────────────────────────────────────────────────────

export const TOPIC_SYSTEM_PROMPT = `## How the topic system works

Topics are named slots in the database where agents read and write content. They are the only way agents communicate — no content is passed through the orchestrator's context window.

### The golden rule: write_topic BEFORE calling any agent

**You MUST call write_topic to store the user's request BEFORE calling any sub-agent.**
Sub-agents read their input from topics. If the topic does not exist yet when the agent runs, the agent will find nothing to read and will fail or produce empty output.

Correct order:
1. write_topic(topicName="...", content=<the user's request or data>)
2. sub_agent(readTopics=["..."], writeTopic="...")

Wrong order (do NOT do this):
1. sub_agent(readTopics=["..."], writeTopic="...")  ← topic doesn't exist yet!
2. write_topic(...)                                  ← too late

### Topic naming rules

- Topic names must always include a version suffix starting at _v0.
  Examples: "research_topic_v0", "research_v0", "draft_v0", "final_v0"
- When refining an existing topic, increment the version: "final_v1", "final_v2", etc.
- Never overwrite a previous version — always write to a new version number.
- This keeps all versions visible in the database for debugging and comparison.

### How agents use topics

- Each agent call takes:
  - readTopics: one or more topic names to read input from (all are concatenated)
  - writeTopic: the single topic name where the agent writes its output
- You choose which topics to connect — this is how you chain agents together.
- You can fan-in multiple topics into one agent: readTopics=["research_v0", "research_v1"]

### Inspecting existing topics

You have three utility tools to work with topics directly:
- **list_topics(runId)** — see all topics that exist for this run, with their agent and size.
- **read_topic(runId, topicName)** — read the content of any topic.
- **write_topic(runId, topicName, content)** — write content directly to a topic.

Use list_topics and read_topic to understand what has already been produced before deciding what to do next.`;
