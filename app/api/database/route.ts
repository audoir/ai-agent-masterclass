import { getDb } from "@/lib/db/index";
import { getStoredMessages } from "@/lib/chat-session";
import type { TopicsMap } from "@/lib/agents/agents/topic-helpers";
import type { EpisodicMemoryEntry } from "@/lib/agents/agents/episodic-memory";
import type { SemanticMemoryEntry } from "@/lib/agents/agents/semantic-memory";
import type { AgentRegistryData, AgentRegistryEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ─── Database SSE Route ───────────────────────────────────────────────────────
//
// GET /api/database
// Opens a persistent SSE connection and pushes a full database snapshot
// every second. The client (useDatabaseStream hook) reads the stream and
// updates the UI in real-time without polling.
// ─────────────────────────────────────────────────────────────────────────────

function getDatabaseSnapshot() {
  const db = getDb();

  const inventory = db.prepare("SELECT * FROM inventory ORDER BY id").all();
  const customers = db.prepare("SELECT * FROM customers ORDER BY id").all();
  const sales = db
    .prepare(
      `SELECT
        s.id,
        s.inventory_id,
        i.product_name,
        s.customer_id,
        c.first_name || ' ' || c.last_name AS customer_name,
        s.quantity_sold,
        s.sale_price,
        s.sale_date
      FROM sales s
      JOIN inventory i ON s.inventory_id = i.id
      JOIN customers c ON s.customer_id = c.id
      ORDER BY s.id`
    )
    .all();

  const usersRaw = db
    .prepare(
      `SELECT
        u.id,
        u.display_name,
        u.semantic_memories,
        u.created_at,
        COUNT(DISTINCT cs.id) AS session_count
      FROM users u
      LEFT JOIN chat_sessions cs ON cs.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC`
    )
    .all() as {
    id: string;
    display_name: string;
    semantic_memories: string;
    created_at: string;
    session_count: number;
  }[];

  const users = usersRaw.map((u) => {
    let semantic_memories: SemanticMemoryEntry[] = [];
    try { semantic_memories = JSON.parse(u.semantic_memories) as SemanticMemoryEntry[]; } catch { /* empty */ }
    return {
      id: u.id,
      display_name: u.display_name,
      created_at: u.created_at,
      session_count: u.session_count,
      semantic_memories,
    };
  });

  const sessions = db
    .prepare(
      `SELECT id, user_id, system_prompt, messages, topics, episodic_memories, agent_registry, created_at, updated_at
       FROM chat_sessions
       ORDER BY created_at DESC`
    )
    .all() as {
    id: string;
    user_id: string | null;
    system_prompt: string | null;
    messages: string;
    topics: string;
    episodic_memories: string;
    agent_registry: string;
    created_at: string;
    updated_at: string;
  }[];

  const chat_sessions = sessions.map((session) => {
    const messages = getStoredMessages(db, session.id);
    let topics: TopicsMap = {};
    try { topics = JSON.parse(session.topics) as TopicsMap; } catch { /* empty */ }
    let episodic_memories: EpisodicMemoryEntry[] = [];
    try { episodic_memories = JSON.parse(session.episodic_memories) as EpisodicMemoryEntry[]; } catch { /* empty */ }
    let agent_registry: Record<string, AgentRegistryEntry> = {};
    try {
      const parsed = JSON.parse(session.agent_registry) as AgentRegistryData | Record<string, AgentRegistryEntry>;
      // New format: { last_finished_agent, registry: { ... } }
      agent_registry = "registry" in parsed ? (parsed as AgentRegistryData).registry : parsed as Record<string, AgentRegistryEntry>;
    } catch { /* empty */ }
    return {
      id: session.id,
      user_id: session.user_id,
      system_prompt: session.system_prompt,
      created_at: session.created_at,
      updated_at: session.updated_at,
      message_count: messages.length,
      messages,
      topics,
      episodic_memories,
      agent_registry,
    };
  });

  return { inventory, customers, sales, users, chat_sessions };
}

export async function GET() {
  const encoder = new TextEncoder();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send(getDatabaseSnapshot());
      } catch (err) {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`)); } catch { /* already closed */ }
        controller.close();
        return;
      }

      intervalId = setInterval(() => {
        try {
          send(getDatabaseSnapshot());
        } catch {
          if (intervalId) { clearInterval(intervalId); intervalId = null; }
        }
      }, 1000);
    },
    cancel() {
      if (intervalId) { clearInterval(intervalId); intervalId = null; }
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
