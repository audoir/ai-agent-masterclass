// ─── Agent Prompts ────────────────────────────────────────────────────────────
//
// Central re-export for all agent system prompts and user prompt templates.
//
// Sub-agent design principles:
//   - Each agent is a single-purpose, isolated function
//   - It has no knowledge of the Orchestrator, other agents, or the pipeline
//   - It receives content via readTopics (one or more topics) and writes output to writeTopic
//   - It acts on whatever content it receives, guided by its system prompt
//   - Optional instructions from the Orchestrator are appended to the user prompt
// ─────────────────────────────────────────────────────────────────────────────

export { RESEARCHER_SYSTEM_PROMPT, researcherUserPrompt } from "./researcher";
export { WRITER_SYSTEM_PROMPT, writerUserPrompt } from "./writer";
export { EDITOR_SYSTEM_PROMPT, editorUserPrompt } from "./editor";
export { orchestratorSystemPrompt } from "./orchestrator";
export { EPISODIC_MEMORY_SYSTEM_PROMPT, episodicMemoryUserPrompt } from "./episodic-memory";
