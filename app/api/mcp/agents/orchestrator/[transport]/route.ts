import { createMcpHandler } from "mcp-handler";
import { propagation, context } from "@opentelemetry/api";
import { runResearcherAgent, RESEARCHER_DESCRIPTION } from "@/lib/agents/agents/researcher";
import { runWriterAgent, WRITER_DESCRIPTION } from "@/lib/agents/agents/writer";
import { runEditorAgent, EDITOR_DESCRIPTION } from "@/lib/agents/agents/editor";
import type { AgentInput } from "@/lib/agents/agents/types";
import { agentInputSchema } from "../../agent-input-schema";

export const runtime = "nodejs";

// ─── Topic-Aware Agent MCP Server ─────────────────────────────────────────────
//
// Registers 3 specialist agent MCP tools:
//   - researcher_agent — queries the DB and writes a research report
//   - writer_agent     — turns research into a blog post draft
//   - editor_agent     — polishes a draft into a final article
//
// Agent implementations live in lib/agents/agents/.
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
        "researcher_agent",
        { title: "Researcher Agent", description: RESEARCHER_DESCRIPTION, inputSchema: agentInputSchema },
        (input: AgentInput) => runResearcherAgent(runId, input, parentContext),
      );

      server.registerTool(
        "writer_agent",
        { title: "Writer Agent", description: WRITER_DESCRIPTION, inputSchema: agentInputSchema },
        (input: AgentInput) => runWriterAgent(runId, input, parentContext),
      );

      server.registerTool(
        "editor_agent",
        { title: "Editor Agent", description: EDITOR_DESCRIPTION, inputSchema: agentInputSchema },
        (input: AgentInput) => runEditorAgent(runId, input, parentContext),
      );
    },
    {},
    {
      basePath: "/api/mcp/agents/orchestrator",
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
