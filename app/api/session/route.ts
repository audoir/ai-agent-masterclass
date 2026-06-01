import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb } from "@/lib/db/index";

export const runtime = "nodejs";

// POST /api/session
// Creates a new user (if userId not provided) and a new chat session linked to that user.
// Returns { userId, sessionId }
export async function POST(req: Request) {
  const db = getDb();

  let userId: string;

  // Check if a userId was passed in the body (returning user)
  let body: { userId?: string; creator?: string } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine
  }

  const displayName =
    body.creator === "orchestrator"
      ? "Orchestrator User"
      : body.creator === "swarm"
      ? "Swarm User"
      : body.creator === "checkpoints"
      ? "Checkpoints User"
      : body.creator === "hitl"
      ? "HITL User"
      : "Anonymous";

  if (body.userId) {
    // Verify the user exists
    const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(body.userId);
    if (existing) {
      userId = body.userId;
    } else {
      // User not found (e.g. server restarted, in-memory DB reset) — create a new one
      userId = randomUUID();
      db.prepare("INSERT INTO users (id, display_name) VALUES (?, ?)").run(userId, displayName);
    }
  } else {
    // New user
    userId = randomUUID();
    db.prepare("INSERT INTO users (id, display_name) VALUES (?, ?)").run(userId, displayName);
  }

  const sessionId = randomUUID();
  db.prepare("INSERT INTO chat_sessions (id, user_id) VALUES (?, ?)").run(sessionId, userId);

  return NextResponse.json({ userId, sessionId });
}
