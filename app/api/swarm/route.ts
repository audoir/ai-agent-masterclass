import { getDb } from "@/lib/db/index";
import { runSwarmAgent } from "@/lib/agents/swarm/agent";
import { getLastFinishedAgent } from "@/lib/agents/agents/registry";
import type { SwarmAgentName } from "@/lib/agents/swarm/config";
import type { SwarmAgentInput, SwarmAgentResult } from "@/lib/agents/swarm/types";
import { trace, propagation, context } from "@opentelemetry/api";
import { appendUserMessage, getStoredMessages } from "@/lib/chat-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Swarm API Route ──────────────────────────────────────────────────────────
//
// POST /api/swarm — runs the swarm pipeline and streams SSE events back.
//
// Body (JSON):
//   prompt  — the user's request
//   runId   — unique identifier for this run (maps to a chat_session id)
//   userId  — the user initiating the run
//
// Routing logic:
//   - First prompt: always starts at "researcher"
//   - Follow-up prompts: resumes from the last agent that ran (from registry)
//     with empty readTopics — the agent uses list_topics()/read_topic() tools
//     to find what was already produced.
//
// SSE event shape:
//   { type: "messages", messages: { role, content }[] }
//   { type: "error", error: string }
// ─────────────────────────────────────────────────────────────────────────────

const MAX_HOPS = 10;

function getMessages(runId: string) {
  const db = getDb();
  return getStoredMessages(db, runId).filter(
    (m: { role: string }) => m.role === "user" || m.role === "assistant",
  );
}

export async function POST(req: Request) {
  const body = await req.json();
  const { prompt, runId, userId } = body as { prompt: string; runId: string; userId: string };

  if (!prompt || !runId || !userId) {
    return new Response(
      JSON.stringify({ error: "prompt, runId, and userId are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const db = getDb();

  // Ensure the chat session row exists and seed the user message.
  db.prepare("INSERT OR IGNORE INTO chat_sessions (id, user_id) VALUES (?, ?)").run(runId, userId);
  appendUserMessage(db, runId, prompt);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // stream already closed
        }
      };

      // Send initial messages snapshot (just the user message)
      send({ type: "messages", messages: getMessages(runId) });

      // Determine starting agent:
      //   - First prompt: start at "researcher"
      //   - Follow-up: resume from the last agent that finished (from registry)
      const lastFinished = getLastFinishedAgent(runId);

      let agentName: SwarmAgentName = lastFinished
        ? (lastFinished as SwarmAgentName)
        : "researcher";

      // For follow-up prompts, pass empty readTopics — the agent uses
      // list_topics()/read_topic() tools to discover what was already produced.
      let input: SwarmAgentInput = {
        instructions: prompt,
        readTopics: [],
      };

      let hops = 0;

      // Create a root span for the entire swarm run so all agent hops appear
      // as children in a single unified trace in Jaeger.
      const tracer = trace.getTracer("ai-agent-masterclass");
      const swarmSpan = tracer.startSpan("swarm-run", {
        attributes: { runId, userId, startingAgent: agentName },
      });

      // Serialize the OTel context (with the swarm span as parent) so each
      // swarm agent's generateText spans are linked to this root span.
      const traceCarrier: Record<string, string> = {};
      propagation.inject(
        trace.setSpan(context.active(), swarmSpan),
        traceCarrier,
      );

      try {
        while (hops < MAX_HOPS) {
          hops++;

          const result: SwarmAgentResult = await runSwarmAgent({
            db,
            runId,
            agentName,
            input,
            traceCarrier,
          });

          // After each agent turn, send the updated messages snapshot
          send({ type: "messages", messages: getMessages(runId) });

          if (result.type === "done") {
            break;
          }

          agentName = result.nextAgent;
          input = {
            instructions: result.instructions,
            readTopics: result.readTopics,
          };
        }

        if (hops >= MAX_HOPS) {
          send({ type: "error", error: `Reached maximum of ${MAX_HOPS} agent hops.` });
        }
      } catch (err) {
        swarmSpan.recordException(err instanceof Error ? err : new Error(String(err)));
        send({ type: "error", error: err instanceof Error ? err.message : String(err) });
      } finally {
        swarmSpan.end();
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
