# Chapter 2 — Long-Term Memory

In Chapter 1 we built an Orchestrator that drives a pipeline of specialist sub-agents. Each run is self-contained: the agents do their work, write topics to the database, and the session ends. The next time the user sends a prompt, the Orchestrator starts fresh — no memory of what the user asked for before, no knowledge of their preferences.

This chapter adds **long-term memory**: the ability for the system to remember what happened in past sessions and to learn the user's preferences over time, so agents can apply them automatically without the user having to repeat themselves.

---

## Background: Types of AI Agent Memory

AI agent memory is typically categorised into two layers, mirroring how human memory works (see the [CoALA paper](https://arxiv.org/abs/2309.02427) from Princeton):

### Short-Term Memory (In-Context)

Short-term memory is the conversation history inside the current context window. The Orchestrator already has this — it sees the full message history for the current session and can refer back to earlier turns. It is fast and always available, but it disappears when the session ends.

### Long-Term Memory (Persistent)

Long-term memory persists across sessions in a database. There are two kinds relevant to this project:

| Type | What it stores | Analogy |
|------|---------------|---------|
| **Episodic** | A record of *what happened* in a specific past session | A diary entry |
| **Semantic** | Stable, generalised facts about the user | A fact-sheet or profile |

**Episodic memory** answers: *"What did the user ask for in session X, and what did the agents do?"*

**Semantic memory** answers: *"What do we know about this user that is consistently true across all sessions?"*

The two types work together in a pipeline:

```
Orchestrator responds to the user (onFinish fires)
    ↓
Episodic Memory Agent  [runs in background via after()]
    → reads session history from chat_sessions.messages JSON
    → appends a factual summary to chat_sessions.episodic_memories JSON array
    ↓
Semantic Memory Agent  [runs immediately after episodic agent]
    → reads the new episodic summary + previous semantic memory
    → appends an updated user preference fact-sheet to users.semantic_memories JSON array
    ↓
Next session starts
    → Orchestrator reads semantic memory (preferences) + recent episodic memories (context)
    → injects both into its system prompt
    → applies user preferences automatically
```

---

## Schema

```
chat_sessions
  messages          TEXT  -- JSON array of { id, role, content, created_at }
  episodic_memories TEXT  -- JSON array of { content, created_at }
                          --   appended after each session; latest is last element

users
  semantic_memories TEXT  -- JSON array of { content, created_at }
                          --   appended after each session; latest is last element
```

Both are **append-only arrays** — each update pushes a new entry rather than overwriting the previous one. The latest entry is always the last element. This means you can inspect the full history of how the memory evolved over time in the **🔑 User State** tab.

---

## Step 1: Triggering Memory After a Session

Memory updates run **after** the Orchestrator responds to the user, using Next.js's `after()` function. This is triggered by the `onFinish` callback of `streamText` — which fires once the Orchestrator has finished streaming its response. The user gets their response immediately and the memory agents run in the background without adding latency.

```typescript
// lib/agents/orchestrator/default.ts

import { after } from "next/server";
import { updateLongTermMemory } from "@/lib/memory";

onFinish: async ({ text }) => {
  await agentMcpClient.close();

  after(() => updateLongTermMemory({ userId, sessionId: runId, finalText: text }));
},
```

The coordinator in `lib/memory.ts` runs the two memory agents in sequence:

```typescript
// lib/memory.ts

export async function updateLongTermMemory({ userId, sessionId, finalText }) {
  // 1. Summarise what happened in this session
  await runEpisodicMemoryAgent({ userId, sessionId });

  // 2. Update the user's preference fact-sheet using the new episodic summary
  await runSemanticMemoryAgent({ userId, sessionId });
}
```

---

## Step 2: The Episodic Memory Agent

The Episodic Memory Agent reads the session's chat history from `chat_sessions.messages` and appends a factual 2–4 sentence summary to `chat_sessions.episodic_memories`.

```typescript
// lib/agents/agents/episodic-memory.ts

function getSessionHistory(sessionId: string): string {
  const db = getDb();
  const messages = getStoredMessages(db, sessionId);
  return messages
    .map((m) => `[${m.created_at}] ${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");
}

function appendEpisodicMemory(sessionId: string, content: string): void {
  const db = getDb();
  const existing = getEpisodicMemories(sessionId);
  existing.push({
    content,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  db.prepare(
    "UPDATE chat_sessions SET episodic_memories = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(JSON.stringify(existing), sessionId);
}

export async function runEpisodicMemoryAgent({ userId, sessionId }) {
  const sessionHistory = getSessionHistory(sessionId);
  const pastMemories = formatPastMemories(getEpisodicMemories(sessionId));

  const result = await generateText({
    model: openai(DEFAULT_MODEL),
    system: EPISODIC_MEMORY_SYSTEM_PROMPT,
    prompt: episodicMemoryUserPrompt(userId, sessionId, sessionHistory, pastMemories),
  });

  appendEpisodicMemory(sessionId, result.text);
}
```

### What the Episodic Agent Records

The key design principle: **only record what actually happened and what the user explicitly stated**. The agent must not infer preferences from the nature of the task.

A good episodic entry covers:
1. What the user requested
2. What the agents did and what the outcome was
3. Any preferences the user explicitly stated (e.g. "keep it under 300 words", "use bullet points") — and only those

The critical distinction is between **task characteristics** and **user preferences**. If the user asks for a blog post, that tells you the task — it does not tell you the user prefers blog posts, or engaging content, or any particular tone. Only words like "I want", "I prefer", "make it", "always", "never" signal an actual preference.

**Example — user types:** *"Write a blog post about our best-selling products"*

✅ Correct episodic memory:
> The user asked for a blog post about their best-selling products. The agents ran the standard research → write → edit pipeline, producing a final article in topic `final_v0`. No explicit preferences were stated.

❌ Incorrect (false positives):
> The user preferred engaging, brand-friendly content with an upbeat tone. *(The user never said this — the agents inferred it from the task type.)*

---

## Step 3: The Semantic Memory Agent

The Semantic Memory Agent reads the new episodic summary and the user's previous semantic memory, then appends an updated preference fact-sheet to `users.semantic_memories`.

```typescript
// lib/agents/agents/semantic-memory.ts

function getLatestEpisodicMemory(sessionId: string): string {
  const db = getDb();
  const row = db
    .prepare("SELECT episodic_memories FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { episodic_memories: string } | undefined;

  if (!row) return "(no episodic memory found for this session)";
  const arr = JSON.parse(row.episodic_memories) as { content: string }[];
  return arr.length > 0 ? arr[arr.length - 1].content : "(no episodic memory found)";
}

function getPreviousSemanticMemory(userId: string): string {
  const memories = getSemanticMemories(userId);
  if (memories.length === 0) return "(no previous semantic memory — this is the first session)";
  return memories[memories.length - 1].content;
}

function appendSemanticMemory(userId: string, content: string): void {
  const db = getDb();
  const existing = getSemanticMemories(userId);
  existing.push({
    content,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  db.prepare("UPDATE users SET semantic_memories = ? WHERE id = ?")
    .run(JSON.stringify(existing), userId);
}

export async function runSemanticMemoryAgent({ userId, sessionId }) {
  const newEpisodicMemory = getLatestEpisodicMemory(sessionId);
  const previousSemanticMemory = getPreviousSemanticMemory(userId);

  const result = await generateText({
    model: openai(DEFAULT_MODEL),
    system: SEMANTIC_MEMORY_SYSTEM_PROMPT,
    prompt: semanticMemoryUserPrompt(userId, previousSemanticMemory, newEpisodicMemory),
  });

  appendSemanticMemory(userId, result.text);
}
```

### What the Semantic Agent Records

Semantic memory is a **living fact-sheet of explicitly stated preferences**. It is updated after every session by reading the new episodic memory and merging any confirmed preferences into the existing fact-sheet.

The test for inclusion is strict: the preference must have been directly stated by the user, not inferred from the task. If the episodic memory contains no explicit preference signals, the semantic memory is left unchanged (or initialised as empty).

The semantic agent also **removes** stale preferences. If a new episodic memory contradicts a previously stored preference, the old one is updated or deleted. This keeps the fact-sheet accurate as the user's preferences evolve over time.

**Example — user states a preference:**

✅ Correct semantic memory:
```
## User Preferences
- The user prefers content under 300 words.
- The user prefers bullet-point format over prose.
```

**Example — user states no preference:**

✅ Correct semantic memory:
```
(No explicit preferences recorded yet.)
```

---

## Step 4: Injecting Memory into the Orchestrator

At the start of each new session, the Orchestrator reads both memory types and injects them into its system prompt.

```typescript
// lib/agents/orchestrator/default.ts

// Fetch past episodic memories (excluding the current session — its messages
// are already in the conversation context)
const pastEpisodicMemories = getPastEpisodicMemoriesForPrompt(userId, runId);

// Fetch the latest semantic memory (distilled user preference fact-sheet)
const semanticMemory = getSemanticMemoryForPrompt(userId);

const systemPrompt = orchestratorSystemPrompt(
  runId,
  toolSummary,
  pastEpisodicMemories,
  semanticMemory,
);
```

```typescript
// lib/agents/agents/memory-utils.ts

// Returns the 5 most recent episodic memories (excluding the current session).
// Reads from chat_sessions.episodic_memories JSON array; takes the last entry
// from each session as the "latest" summary.
export function getPastEpisodicMemoriesForPrompt(
  userId: string,
  currentSessionId: string,
): string | undefined {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT id, episodic_memories, created_at
       FROM chat_sessions
       WHERE user_id = ? AND id != ? AND episodic_memories != '[]'
       ORDER BY created_at ASC`,
    )
    .all(userId, currentSessionId);

  // For each session, take the last (latest) entry from the array
  const entries = sessions.flatMap((session) => {
    const arr = JSON.parse(session.episodic_memories);
    if (arr.length === 0) return [];
    return [{ sessionId: session.id, entry: arr[arr.length - 1] }];
  });

  const recent = entries.slice(-5);
  if (recent.length === 0) return undefined;

  return recent
    .map(({ sessionId, entry }) =>
      `[Session ${sessionId} · ${entry.created_at}]\n${entry.content}`)
    .join("\n\n");
}

// Returns the latest semantic memory for the user.
// Reads from users.semantic_memories JSON array; the last element is the latest.
export function getSemanticMemoryForPrompt(userId: string): string | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT semantic_memories FROM users WHERE id = ?")
    .get(userId) as { semantic_memories: string } | undefined;

  if (!row) return undefined;
  const arr = JSON.parse(row.semantic_memories);
  if (arr.length === 0) return undefined;
  const latest = arr[arr.length - 1];
  return `[Semantic Memory #${arr.length} · ${latest.created_at}]\n${latest.content}`;
}
```

### The Orchestrator System Prompt

The memory is injected in two clearly labelled sections. Semantic memory comes first because it contains the most actionable, durable preferences:

```
## User Preferences (Semantic Memory)

This is a distilled fact-sheet of what is consistently true about this user,
built up from all their past sessions. You must apply these preferences
automatically — do not ask the user to repeat them.

[Semantic Memory #3 · 2026-06-02 18:30:00]
## User Preferences
- The user prefers content under 300 words.
- The user wants bullet points instead of prose.

## Recent Session History (Episodic Memory)

Summaries of the user's most recent sessions. Use these to understand what
they have been working on and to avoid repeating work unnecessarily.

[Session abc123 · 2026-06-01 14:22:00]
The user asked for a blog post about their best-selling electronics...
```

The Orchestrator is instructed to pass relevant preferences to sub-agents via the `instructions` field:

```
## Applying long-term memory

The user's preferences are listed above under "User Preferences".
You MUST apply them automatically:
- Pass relevant preferences to sub-agents via the instructions field.
- Do not ask the user to re-state preferences that are already in semantic memory.
- If the user gives a new instruction that contradicts a stored preference,
  follow the new instruction for this session (the memory agents will update
  the preference after the session).
```

---

## What the UI Shows

### Orchestrator tab

The right panel shows **📡 Topics** — agent topic cards written during the current run.

### 🔑 User State tab

Clicking this tab shows the full user state for the current user, including:

- **💡 Semantic Memory (user-level)** — a collapsible section at the top, showing all entries newest-first with the latest auto-expanded. This is shown once per user, not per session, since semantic memory is user-scoped (stored in `users.semantic_memories`).
- **Session cards** — each session card has a **🧠 Memory** tab showing the episodic memory entries for that specific session (stored in `chat_sessions.episodic_memories`).

The user row header shows a `💡 N` badge when semantic memory entries exist. Session card headers show a `🧠 N` badge for episodic memory entries.

---

## The Full Memory Flow

Here's what happens across two sessions when the user states a preference in the second one:

**Session 1:** *"Write a blog post about our best-selling electronics"*

```
Orchestrator responds to the user with the blog post
    ↓
Episodic Agent appends to chat_sessions.episodic_memories (in background):
  "The user asked for a blog post about their best-selling electronics.
   The agents ran the standard pipeline, producing a final article in final_v0.
   No explicit preferences were stated."
    ↓
Semantic Agent appends to users.semantic_memories (in background):
  "(No explicit preferences recorded yet.)"

    ↓ [user replies]

User: "Write the blog post in bullet-point format"
    ↓
Orchestrator responds to the user with a revised bullet-point version
    ↓
Episodic Agent appends entry #2 to chat_sessions.episodic_memories:
  "The user asked for a blog post about their best-selling electronics.
   The agents ran the standard pipeline, producing a final article in final_v0.
   The user then asked for the post to be rewritten in bullet-point format,
   and the editor produced a revised version in final_v1."
    ↓
Semantic Agent appends entry #2 to users.semantic_memories:
  "## User Preferences
   - The user prefers bullet-point format over prose."
```

**Session 2:** *"Write a report on customer trends."*

```
Orchestrator reads users.semantic_memories (last entry):
  "## User Preferences
   - The user prefers bullet-point format over prose."

Orchestrator passes to Writer Agent via instructions field:
  "Write in bullet-point format."

Orchestrator responds to the user with a bullet-point report
    ↓
Episodic Agent appends to chat_sessions.episodic_memories:
  "The user asked for a report on customer trends. The agents ran the standard
   pipeline, producing a final report in final_v0 in bullet-point format
   (applied automatically from semantic memory)."
    ↓
Semantic Agent appends (no new preferences stated — existing preference confirmed):
  "## User Preferences
   - The user prefers bullet-point format over prose."
```

**Session 3:** *"Write a blog post about our top customers"*

```
Orchestrator reads users.semantic_memories (last entry):
  "## User Preferences
   - The user prefers bullet-point format over prose."

→ The user gets bullet points automatically, without having to ask again.
```

---

## Running the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need an `OPENAI_API_KEY` in `.env.local`.

To see long-term memory in action, follow the same pattern as the Full Memory Flow above:

**Run 1 — no preference stated:**
1. In the **🤖 Orchestrator** tab, send a prompt like *"Write a blog post about our best-selling electronics"*.
2. After the Orchestrator responds, switch to the **🔑 User State** tab. The episodic and semantic memories will appear automatically within a few seconds (they run in the background via `after()`) — no refresh needed.
3. The semantic memory should show `(No explicit preferences recorded yet.)`.

**Run 1 continued — state a preference:**
4. Back in the **🤖 Orchestrator** tab, reply: *"Write the blog post in bullet-point format"*.
5. After the Orchestrator responds again, check the **🔑 User State** tab — the episodic memory will have a second entry and the semantic memory will now contain your preference.

**Run 2 — preference applied automatically:**
6. Click **New Run** and send a similar prompt: *"Write a blog about customer trends."*
7. The Orchestrator will read the semantic memory and pass the bullet-point preference to the Writer Agent automatically — no need to ask again.
8. In the **🔑 User State** tab → expand the new session → click **🤖 System Prompt** to see the semantic memory injected into the Orchestrator's prompt.

---

**[← Back to README](../README.md)** · **[← Chapter 1](chapter-01-multi-agent-system.md)** · **[Next: Chapter 3 — Swarm →](chapter-03-swarm.md)**
