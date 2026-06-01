# Chapter 4 — State Checkpointing and Time Travel Debugging

In Chapters 1–3 we built an Orchestrator that drives a pipeline of specialist sub-agents, added long-term memory, and explored a swarm architecture. Every run was a one-way trip: the agents did their work, wrote topics to the database, and the session ended. If you wanted to change something mid-run — a different tone, a different format, a different direction — you had to start over from scratch.

This chapter adds **state checkpointing**: the ability to snapshot the conversation state before every step, roll back to any snapshot, and re-run the pipeline from that point — optionally with a new prompt. This is sometimes called **time travel debugging** for AI agents.

---

## Background: Why Checkpointing?

Long-running agent pipelines are expensive. A full Researcher → Writer → Editor run can take 30–60 seconds and cost several cents in API calls. If the Writer produces a draft you don't like, you shouldn't have to re-run the Researcher. You should be able to roll back to just before the Writer ran and give it different instructions.

Checkpointing also enables a new kind of interaction: **branching**. Instead of a linear conversation, you can explore multiple continuations from the same point — like a version control system for your agent runs.

The key insight is that the entire state of an agent pipeline is just the `messages` JSON array and the `topics` JSON object stored in `chat_sessions`. If you can snapshot both before each step and restore them on demand, you get full time travel for free.

---

## Architecture

```
User prompt
    ↓
POST /api/orchestrator/checkpoints/start { prompt, runId, userId }
    ↓
runOrchestratorAgent (lib/agents/orchestrator/checkpoints.ts)
    │
    ├── checkpointBeforeMessage()  ← snapshot before user message
    ├── initChatSession()          ← write user message to DB
    │
    └── runOrchestratorCore()
            │
            ├── streamText({ abortSignal: req.signal, ... })
            │
            ├── experimental_onToolCallStart:
            │       └── checkpointBeforeMessage()  ← snapshot before tool call
            │
            ├── onStepFinish (tool call step):
            │       ├── saveAssistantMessage()
            │       ├── saveToolCallMessage()
            │       └── saveToolMessage()
            │
            ├── onAbort:
            │       └── agentMcpClient.close()     ← clean up on stop
            │
            └── onFinish:
                    ├── checkpointBeforeMessage()  ← snapshot before assistant reply
                    └── saveAssistantMessage()
```

### Restore Flow

```
User clicks "🔖 Rerun from here" on a message
    ↓
POST /api/orchestrator/checkpoints/restore { sessionId, messageId, userId, prompt? }
    ↓
runOrchestratorRestore (lib/agents/orchestrator/restore.ts)
    │
    ├── restoreCheckpoint(messageId)
    │       ├── Find checkpoint entry in chat_sessions.checkpoints JSON array
    │       ├── Overwrite chat_sessions.messages with messages_snapshot
    │       └── Overwrite chat_sessions.topics with topics_snapshot
    │
    ├── (optional) checkpointBeforeMessage() + appendUserMessage()
    │
    └── runOrchestratorCore()  ← same pipeline, fresh start from restored state
```

---

## Schema

No new tables are added. Instead, checkpoints are stored as a JSON array in a new `checkpoints` column on the existing `chat_sessions` table:

```sql
CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  system_prompt TEXT,
  messages TEXT NOT NULL DEFAULT '[]',
  topics TEXT NOT NULL DEFAULT '{}',
  episodic_memories TEXT NOT NULL DEFAULT '[]',
  agent_registry TEXT NOT NULL DEFAULT '{}',
  checkpoints TEXT NOT NULL DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

Each checkpoint entry in the `checkpoints` JSON array has this shape:

```typescript
interface StoredCheckpoint {
  message_id: string;          // short UUID (first 8 chars) — also the id of the next message
  messages_snapshot: StoredMessage[];          // full copy of messages at this point
  topics_snapshot: Record<string, unknown>;   // full copy of topics at this point
  created_at: string;
}
```

The `message_id` is a short UUID that is **shared** between the checkpoint and the message that will be written next. This means you can look up a checkpoint by the id of the message you want to roll back to.

---

## Step 1: Saving Checkpoints

The checkpoint logic lives in `lib/chat-session.ts`. The core function is `checkpointBeforeMessage`:

```typescript
// lib/chat-session.ts

/**
 * Snapshot the current messages and topics, and key the checkpoint to a
 * freshly generated UUID (first 8 chars). Returns the generated id so callers
 * can pass it on to the message that will be written next — making the
 * checkpoint id and the upcoming message id the same value.
 *
 * Call this BEFORE writing any new messages.
 */
export function checkpointBeforeMessage(
  db: Database.Database,
  sessionId: string
): string {
  const messageId = randomUUID().slice(0, 8);
  saveCheckpoint(db, sessionId, messageId);
  return messageId;
}

export function saveCheckpoint(
  db: Database.Database,
  sessionId: string,
  messageId: string
): void {
  const row = db
    .prepare("SELECT messages, topics FROM chat_sessions WHERE id = ?")
    .get(sessionId) as { messages: string; topics: string } | undefined;

  let messages: StoredMessage[] = [];
  let topics: Record<string, unknown> = {};
  if (row) {
    try { messages = JSON.parse(row.messages) as StoredMessage[]; } catch { /* empty */ }
    try { topics = JSON.parse(row.topics) as Record<string, unknown>; } catch { /* empty */ }
  }

  const checkpoints = getStoredCheckpoints(db, sessionId).filter(
    (cp) => cp.message_id !== messageId
  );
  checkpoints.push({
    message_id: messageId,
    messages_snapshot: messages,
    topics_snapshot: topics,
    created_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  });
  setStoredCheckpoints(db, sessionId, checkpoints);
}
```

The checkpoint id and the id of the next message written are always the same value — `checkpointBeforeMessage` generates the UUID, saves the checkpoint, and returns the UUID so the caller can pass it to the message writer.

---

## Step 2: Where Checkpoints Are Saved

Checkpoints are saved at three points in the pipeline:

```typescript
// lib/agents/orchestrator/checkpoints.ts

export async function runOrchestratorAgent({ db, prompt, runId, userId, abortSignal }) {
  // Checkpoint 0: before the user message.
  // The returned id is passed to initChatSession so the user message gets
  // the same id as the checkpoint — enabling "undo the whole prompt".
  const messageId = checkpointBeforeMessage(db, runId);

  const messages = initChatSession(db, runId, prompt, messageId);

  return runOrchestratorCore({ db, sessionId: runId, userId, messages, abortSignal });
}
```

```typescript
// lib/agents/orchestrator/core.ts

experimental_onToolCallStart: async () => {
  // Checkpoint before each tool call execution.
  // The returned id is stored in the outer `messageId` variable so
  // onStepFinish can assign the same id to the tool call message.
  messageId = checkpointBeforeMessage(db, sessionId);
},

onStepFinish: async ({ toolCalls, toolResults, text }) => {
  if (toolCalls && toolCalls.length > 0) {
    saveAssistantMessage(db, sessionId, text, messageId);
    for (const toolCall of toolCalls) {
      saveToolCallMessage(
        db, sessionId,
        toolCall.toolCallId, toolCall.toolName, toolCall.input,
      );
    }
    // No checkpoint between tool call and tool result — they are atomic.
    for (const toolResult of toolResults) {
      saveToolMessage(db, sessionId, toolResult.toolCallId, toolResult.toolName, toolResult.output);
    }
  }
},

onFinish: async ({ text }) => {
  await agentMcpClient.close();
  // Checkpoint before the final assistant message so the user can roll
  // back to just before the assistant's reply and regenerate it.
  const messageId = checkpointBeforeMessage(db, sessionId);
  saveAssistantMessage(db, sessionId, text, messageId);
},
```

The mental model:

```
Checkpoint[0] = state before user message     ← "undo the whole prompt"
  → user message written (id="a1b2c3d4")
Checkpoint[1] = state before tool call step 1 ← "rerun from step 1"
  → assistant + tool call written, tool result written
Checkpoint[2] = state before tool call step 2 ← "rerun from step 2"
  → assistant + tool call written, tool result written
Checkpoint[3] = state before assistant reply  ← "regenerate the reply"
  → assistant message written (id="a3b4c5d6")
```

### Why `experimental_onToolCallStart`?

The AI SDK fires `experimental_onToolCallStart` **before** the tool executes — which is exactly when we need to snapshot the state. `onStepFinish` fires **after** the tool has already run and returned its result, so it is too late to checkpoint the pre-tool state there. By using `experimental_onToolCallStart`, the checkpoint captures the world as it was before the tool call, and the returned `messageId` is threaded through to `onStepFinish` so the tool call message gets the same id.

---

## Step 3: Restoring a Checkpoint

```typescript
// lib/chat-session.ts

export function restoreCheckpoint(
  db: Database.Database,
  sessionId: string,
  messageId: string
): ModelMessage[] | null {
  const checkpoints = getStoredCheckpoints(db, sessionId);
  const checkpoint = checkpoints.find((cp) => cp.message_id === messageId);

  if (!checkpoint) return null;

  // Restore messages and topics from the snapshot.
  const restoredMessages: StoredMessage[] = checkpoint.messages_snapshot;
  db.prepare(
    "UPDATE chat_sessions SET messages = ?, topics = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(
    JSON.stringify(restoredMessages),
    JSON.stringify(checkpoint.topics_snapshot),
    sessionId,
  );

  return storedMessagesToModelMessages(restoredMessages);
}
```

```typescript
// lib/agents/orchestrator/restore.ts

export async function runOrchestratorRestore({
  db, sessionId, messageId, prompt, userId, abortSignal
}) {
  const restoredMessages = restoreCheckpoint(db, sessionId, messageId);
  if (!restoredMessages) {
    throw new Error(`No checkpoint found for session ${sessionId} at message ${messageId}`);
  }

  // If a new prompt was provided, checkpoint before inserting it
  // (so the user can roll back to before this new prompt too).
  if (prompt) {
    const messageId = checkpointBeforeMessage(db, sessionId);
    appendUserMessage(db, sessionId, prompt, messageId);
    restoredMessages.push({ role: "user", content: prompt });
  }

  return runOrchestratorCore({
    db, sessionId, userId, messages: restoredMessages,
    functionId: "orchestrator-restore",
    abortSignal,
  });
}
```

The restore operation overwrites both `messages` and `topics` with their snapshots. This is important: topics written by agents after the checkpoint point are also rolled back, so the restored state is fully consistent.

---

## Step 4: Aborting a Run

The AI SDK's `abortSignal` parameter lets the client cancel a stream mid-run. When the user clicks the Stop button, `useCompletion`'s `stop()` function cancels the HTTP request. This fires `req.signal` on the server, which propagates to `streamText` and immediately stops the LLM call.

```typescript
// app/api/orchestrator/checkpoints/start/route.ts

const result = await runOrchestratorAgent({
  db, prompt, runId, userId,
  abortSignal: req.signal,  // ← forward the request's abort signal
});
return result.toUIMessageStreamResponse();
```

```typescript
// lib/agents/orchestrator/core.ts

return streamText({
  model: openai(DEFAULT_MODEL),
  messages,
  abortSignal,  // ← forwarded to the LLM API call
  onAbort: async () => {
    // Close the MCP client to release the connection.
    await agentMcpClient.close();
  },
  // ...
});
```

The DB state stays consistent because `onStepFinish` only fires for **fully completed steps**. Any step that gets aborted mid-stream simply doesn't get written to the DB — so the last checkpoint is always valid.

---

## The UI

The **🔖 Checkpoints** tab (`app/components/CheckpointsView.tsx`) has the same two-panel layout as the Orchestrator tab, but the right panel shows the raw messages from the database instead of agent topics.

### 🔑 User State tab

The **🔑 User State** inner tab (in the header of the Checkpoints view) shows the full user state for the current user — sessions, agent topics, and system prompts — identical to the User State tab in the other agent views.

### Left Panel — Chat

The left panel shows the streaming orchestrator response, exactly like the Orchestrator tab. During a restore run, the restore's streaming response appears here.

### Right Panel — Two Tabs

**🔖 Messages tab** — shows every message in `chat_sessions.messages` for the current session, streamed live via SSE from `/api/checkpoints`. Each message shows:
- The role (`user`, `assistant`, `tool`)
- The message id (`#a1b2c3d4`, etc.)
- A **🔖 Rerun from here** button if a checkpoint exists for that message id

Clicking **🔖 Rerun from here** opens a modal:
- For tool call messages: an optional textarea to inject a new prompt before re-running
- For user messages: a required textarea to provide a replacement prompt
- A **▶ Run** button that triggers the restore

**📡 Topics tab** — shows the agent topic cards written during the current run, identical to the Orchestrator tab.

### Stop Button

While a run is in progress, the send button in the input bar is replaced with a red ■ Stop button. Clicking it calls `useCompletion`'s `stop()`, which cancels the HTTP request and triggers `onAbort` on the server.

---

## Running the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need an `OPENAI_API_KEY` in `.env.local`.

### Example: Stop and Rerun with a New Prompt

Here is the exact scenario that motivated this chapter:

**Step 1 — Start a run:**

In the **🔖 Checkpoints** tab, send:
> *"Write a blog post about our best-selling electronics"*

Watch the right panel's **🔖 Messages** tab fill in as the Orchestrator calls the Researcher, Writer, and Editor agents.

**Step 2 — Stop during the Writer:**

While the Writer agent is running (you'll see messages appearing in the Messages tab), click the red ■ Stop button. The stream stops immediately. The DB state is consistent — only fully completed steps are written.

**Step 3 — Rerun from the Writer with a new prompt:**

Find a tool call message for `writer_agent` in the Messages tab. It will have a **🔖 Rerun from here** button. Click it.

A modal appears. In the textarea, type:
> *"Make sure the blog is in bullet point format"*

Click **▶ Run**.

**What happens:**
1. `restoreCheckpoint` overwrites `messages` and `topics` with the snapshot taken before the Writer's tool call
2. The new prompt is inserted as a user message
3. `runOrchestratorCore` re-runs from the restored state
4. The Orchestrator sees the new instruction and passes it to the Writer
5. The Writer produces a bullet-point blog post
6. The Editor polishes it
7. The final result streams into the left panel

The Researcher's work is preserved — it was not re-run. Only the Writer and Editor ran again, with the new instruction.

---

## Key Design Decisions

### Checkpoint Before, Not After

Checkpoints are saved **before** each step, not after. This is the correct design for the use cases:

- **Edit a message** → roll back to the state *before* that message was generated, then re-run with the edited content
- **Rerun from a tool call** → roll back to the state *before* that tool call was made, then re-execute from there

If checkpoints were saved after each step, you would need to roll back to the *previous* checkpoint to undo the current step — which is confusing and error-prone.

### Topics Are Also Snapshotted

Each checkpoint captures both `messages_snapshot` and `topics_snapshot`. This is necessary because topics are written by sub-agents during the pipeline — rolling back only the messages without rolling back the topics would leave the session in an inconsistent state (e.g. a `draft_v0` topic written by the Writer would still exist after rolling back to before the Writer ran).

### Short UUID Message IDs

Message IDs are short UUIDs (first 8 characters of `randomUUID()`). The checkpoint id and the id of the next message written are always the same value — `checkpointBeforeMessage` generates the UUID, saves the checkpoint, and returns the UUID so the caller can pass it to the message writer. This makes it trivial to look up a checkpoint by the id of the message you want to roll back to.

### `experimental_onToolCallStart` for Pre-Tool Checkpointing

The AI SDK's `experimental_onToolCallStart` callback fires **before** the tool executes. This is the right place to snapshot state — by the time `onStepFinish` fires, the tool has already run and its result is in the context. The `messageId` generated in `experimental_onToolCallStart` is stored in a closure variable and picked up by `onStepFinish` to assign the same id to the tool call message.

---

## Further Exploration: Branching

The current implementation supports **linear time travel**: you can roll back to any checkpoint and re-run the pipeline from that point, replacing the subsequent history. But because checkpoints are never deleted, the data model already supports something more powerful: **branching**.

Consider what happens after a restore:

```
Original run:
  Checkpoint[0] → user message (id="a1b2c3d4")
  Checkpoint[1] → researcher tool call (id="e5f6a7b8")
  Checkpoint[2] → writer tool call (id="c9d0e1f2")
  Checkpoint[3] → assistant reply (id="a3b4c5d6")

After restoring Checkpoint[2] and re-running with a new prompt:
  messages = [user, researcher tool call, researcher result]  ← from snapshot
  New messages appended: [new user prompt, writer tool call, writer result, assistant reply]

  Checkpoint[0] → still in the array (snapshot of empty state)
  Checkpoint[1] → still in the array (snapshot before researcher)
  Checkpoint[2] → still in the array (snapshot before original writer call)
  Checkpoint[3] → still in the array (snapshot before original assistant reply)
  Checkpoint[4] → new checkpoint before new user prompt
  Checkpoint[5] → new checkpoint before new writer call
  Checkpoint[6] → new checkpoint before new assistant reply
```

Checkpoints [2] and [3] now point to a "branch" that no longer exists in the current `messages` array — but their `messages_snapshot` and `topics_snapshot` are fully intact. To navigate to that branch, you would:

1. Call `restoreCheckpoint` with the `message_id` from Checkpoint[2] or [3]
2. The messages and topics are restored to that exact state
3. Re-run the pipeline from there

This is exactly how git branches work: the commit graph is never rewritten, and you can always check out any commit to get back to that state.

Implementing a full branching UI would require:
- A way to display all checkpoints (not just those matching current message ids)
- A visual branch selector (e.g. a tree view or dropdown)
- Separate branch labels so users can name and navigate between branches

That is beyond the scope of this chapter, but the storage layer is already ready for it — no schema changes needed.

---

## Further Exploration: Diff-Based Checkpoints

The current implementation stores a **full snapshot** of `messages` and `topics` at every checkpoint. This is simple to implement and easy to debug — you can inspect any checkpoint in the database and immediately see the complete state at that point. But it does not scale well: if a session has 50 messages and 10 checkpoints, you are storing 500 message records across those snapshots, most of which are identical to the previous checkpoint.

A more storage-efficient approach — again borrowed from git — is to store **diffs** instead of full snapshots.

Instead of:
```json
{
  "message_id": "c9d0e1f2",
  "messages_snapshot": [ ...all 12 messages... ],
  "topics_snapshot": { ...all 4 topics... }
}
```

You would store:
```json
{
  "message_id": "c9d0e1f2",
  "messages_diff": [
    { "op": "add", "index": 12, "value": { "id": "c9d0e1f2", "role": "assistant", ... } }
  ],
  "topics_diff": []
}
```

To restore to a particular checkpoint, you would:

1. Start from the initial empty state (`messages = []`, `topics = {}`)
2. Replay each diff in order up to (but not including) the target checkpoint
3. The result is the exact state at that point

This is analogous to how git stores commits as diffs against the parent commit, and reconstructs any file version by replaying the diff chain from the root.

The trade-off:
- **Full snapshots** — O(n × k) storage (n messages × k checkpoints), O(1) restore (single read)
- **Diffs** — O(n + k) storage (total unique messages + diff metadata), O(k) restore (replay k diffs)

For the session sizes in this project (tens of messages, handful of checkpoints), full snapshots are the right choice. Diff-based checkpointing becomes worthwhile when sessions are long-lived, messages are large (e.g. multi-kilobyte tool results), or many checkpoints accumulate over time.

---

## Further Reading

- [Vercel AI SDK — Stopping Streams](https://ai-sdk.dev/docs/advanced/stopping-streams)
- [LangGraph — Checkpointing](https://langchain-ai.github.io/langgraph/concepts/persistence/)
- [OpenAI — Conversation State](https://platform.openai.com/docs/guides/conversation-state)

---

**[← Back to README](../README.md)** · **[← Chapter 3](chapter-03-swarm.md)** · **[Next: Chapter 5 — Human-in-the-Loop →](chapter-05-hitl.md)**
