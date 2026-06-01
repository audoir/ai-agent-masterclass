import { getDb } from "@/lib/db/index";
import type { AgentRegistryData, AgentRegistryEntry, AgentRegistryItem, AgentStatus } from "@/lib/types";

// ─── Agent Registry Helpers ───────────────────────────────────────────────────
//
// Thin helpers for reading and writing the agent_registry JSON object stored
// in chat_sessions.agent_registry.
//
// The top-level structure is:
//   {
//     last_finished_agent: string | null,   ← most recently completed agent
//     registry: {
//       "researcher": {
//         status: 'running' | 'done' | 'error',
//         error_message: string | null,
//         runs: [
//           { system_prompt, started_at, finished_at },
//           ...
//         ]
//       },
//       ...
//     }
//   }
//
// last_finished_agent is updated whenever an agent finishes (done or error).
// The swarm loop uses it to resume from the right specialist on follow-up prompts.
//
// An agent may be invoked multiple times per session; each invocation appends
// a new run object to the runs array.
//
// Typical lifecycle:
//   1. registerAgent(runId, agentName)                    → appends a new run, sets status='running'
//   2. setAgentSystemPrompt(runId, agentName, prompt)     → sets system_prompt on last run
//   3. finishAgent(runId, agentName)                      → sets status='done', updates last_finished_agent
//   4. failAgent(runId, agentName, msg)                   → sets status='error', updates last_finished_agent
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_REGISTRY: AgentRegistryData = { last_finished_agent: null, registry: {} };

function getRegistryData(sessionId: string): AgentRegistryData {
  const db = getDb();
  const row = db
    .prepare("SELECT agent_registry FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { agent_registry: string } | undefined;
  if (!row) return { ...EMPTY_REGISTRY };
  try {
    const parsed = JSON.parse(row.agent_registry) as AgentRegistryData;
    // Ensure the shape is correct (handles old data that was just a registry object)
    if (!parsed.registry) return { last_finished_agent: null, registry: parsed as unknown as Record<string, AgentRegistryEntry> };
    return parsed;
  } catch {
    return { ...EMPTY_REGISTRY };
  }
}

function saveRegistryData(sessionId: string, data: AgentRegistryData): void {
  const db = getDb();
  db.prepare(
    "UPDATE chat_sessions SET agent_registry = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(data), sessionId);
}

function now(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

/**
 * Append a new run entry for the agent with status='running'.
 * Call this at the start of every agent invocation.
 */
export function registerAgent(runId: string, agentName: string): void {
  const data = getRegistryData(runId);
  if (!data.registry[agentName]) {
    data.registry[agentName] = { status: "running", error_message: null, runs: [] };
  }
  data.registry[agentName].status = "running";
  data.registry[agentName].error_message = null;
  data.registry[agentName].runs.push({
    system_prompt: null,
    started_at: now(),
    finished_at: null,
  });
  saveRegistryData(runId, data);
}

/**
 * Update the system_prompt for the last run of an agent.
 */
export function setAgentSystemPrompt(runId: string, agentName: string, systemPrompt: string): void {
  const data = getRegistryData(runId);
  const entry = data.registry[agentName];
  if (!entry || entry.runs.length === 0) return;
  entry.runs[entry.runs.length - 1].system_prompt = systemPrompt;
  saveRegistryData(runId, data);
}

/**
 * Mark the agent as done and set finished_at on the last run.
 * Also updates last_finished_agent.
 */
export function finishAgent(runId: string, agentName: string): void {
  const data = getRegistryData(runId);
  const entry = data.registry[agentName];
  if (!entry || entry.runs.length === 0) return;
  entry.status = "done";
  entry.runs[entry.runs.length - 1].finished_at = now();
  data.last_finished_agent = agentName;
  saveRegistryData(runId, data);
}

/**
 * Mark the agent as failed and set finished_at + error_message on the last run.
 * Also updates last_finished_agent.
 */
export function failAgent(runId: string, agentName: string, errorMessage?: string): void {
  const data = getRegistryData(runId);
  const entry = data.registry[agentName];
  if (!entry || entry.runs.length === 0) return;
  entry.status = "error";
  entry.error_message = errorMessage ?? null;
  entry.runs[entry.runs.length - 1].finished_at = now();
  data.last_finished_agent = agentName;
  saveRegistryData(runId, data);
}

/**
 * Return the name of the agent that most recently finished, or null if none.
 * Used by the swarm loop to resume from the right specialist on follow-up prompts.
 */
export function getLastFinishedAgent(runId: string): string | null {
  return getRegistryData(runId).last_finished_agent;
}

/**
 * Return all registry entries for a given run as a flat list ordered by the
 * started_at of the first run, suitable for display in the UI.
 */
export function getAgentRegistry(runId: string): AgentRegistryItem[] {
  const { registry } = getRegistryData(runId);
  return Object.entries(registry)
    .map(([agentName, entry]) => ({ agentName, entry }))
    .sort((a, b) => {
      const aStart = a.entry.runs[0]?.started_at ?? "";
      const bStart = b.entry.runs[0]?.started_at ?? "";
      return aStart.localeCompare(bStart);
    })
    .map(({ agentName, entry }) => ({ agent_name: agentName, ...entry }));
}

/**
 * Return the currently running agent for a run, or null if none is running.
 */
export function getRunningAgent(runId: string): AgentRegistryItem | null {
  const all = getAgentRegistry(runId);
  return all.find((e) => e.status === "running") ?? null;
}

/**
 * Return the overall run status derived from all agent entries:
 *   - 'running'  if any agent is still running
 *   - 'error'    if any agent errored (and none are still running)
 *   - 'done'     if all agents finished successfully
 *   - null       if no agents have been registered yet
 */
export function getRunStatus(runId: string): AgentStatus | null {
  const entries = getAgentRegistry(runId);
  if (entries.length === 0) return null;
  if (entries.some((e) => e.status === "running")) return "running";
  if (entries.some((e) => e.status === "error")) return "error";
  return "done";
}
