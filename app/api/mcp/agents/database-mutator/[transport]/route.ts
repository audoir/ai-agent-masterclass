import { createMcpHandler } from "mcp-handler";
import { propagation, context } from "@opentelemetry/api";
import { runDatabaseMutatorAgent, DATABASE_MUTATOR_DESCRIPTION } from "@/lib/agents/agents/database-mutator";
import { runResearcherAgent, RESEARCHER_DESCRIPTION } from "@/lib/agents/agents/researcher";
import type { AgentInput } from "@/lib/agents/agents/types";
import { agentInputSchema } from "../../agent-input-schema";

export const runtime = "nodejs";

// ─── Database Mutator Agent MCP Server ────────────────────────────────────────
//
// Registers the database_mutator_agent MCP tool:
//   - Reads a mutation request from one or more topics
//   - Uses read tools to verify referenced records exist
//   - Applies INSERT/UPDATE/DELETE via the update MCP tools
//   - INSERT executes immediately; UPDATE/DELETE require explicit user
//     confirmation via a confirmation topic on a second pass
//
// Agent implementation lives in lib/agents/agents/database-mutator.ts.
// Topics are stored in chat_sessions.topics (JSON object).
// ─────────────────────────────────────────────────────────────────────────────

function makeHandler(request: Request) {
  const carrier: Record<string, string> = {};
  request.headers.forEach((value, key) => { carrier[key] = value; });
  const parentContext = propagation.extract(context.active(), carrier);

  // Extract the run id from the custom header injected by the orchestrator.
  const runId = request.headers.get("x-run-id") ?? "";

  return createMcpHandler(
    (server) => {
      server.registerTool(
        "database_mutator_agent",
        { title: "Database Mutator Agent", description: DATABASE_MUTATOR_DESCRIPTION, inputSchema: agentInputSchema },
        (input: AgentInput) => runDatabaseMutatorAgent(runId, input, parentContext),
      );
      server.registerTool(
        "researcher_agent",
        { title: "Researcher Agent", description: RESEARCHER_DESCRIPTION, inputSchema: agentInputSchema },
        (input: AgentInput) => runResearcherAgent(runId, input, parentContext),
      );
    },
    {},
    {
      basePath: "/api/mcp/agents/database-mutator",
      maxDuration: 120,
      verboseLogs: true,
    },
  );
}

export async function GET(request: Request) {
  return makeHandler(request)(request);
}

export async function POST(request: Request) {
  return makeHandler(request)(request);
}
