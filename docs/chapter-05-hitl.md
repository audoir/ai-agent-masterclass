# Chapter 5 — Human-in-the-Loop (HITL)

In Chapters 1–4 we built an Orchestrator that drives a pipeline of specialist sub-agents, added long-term memory, explored a swarm architecture, and added state checkpointing. Every pipeline ran autonomously from start to finish — the agent decided what to do, called the tools, and reported back.

This chapter adds **Human-in-the-Loop (HITL)**: the ability for an agent to deliberately pause mid-pipeline and wait for a human to either approve a high-risk action or provide missing information before continuing.

---

## Background: Why HITL?

Autonomy is a double-edged sword. It's great that an agent can write an email, query a database, or execute code via MCP. But you do not want an AI sending a destructive command — like `DROP TABLE` or `DELETE FROM sales WHERE sale_date < '2026-01-01'` — without a human in the loop.

HITL solves two distinct problems:

### 1. Authorization (The Gatekeeper)

The agent halts before taking a **high-risk action** and waits for a human to click "Approve" or "Reject". The classic examples:

- Deleting records from a database
- Updating prices or customer data
- Sending an email to a client
- Executing a shell command

Without HITL, the agent executes immediately. With HITL, the agent describes exactly what it is about to do and asks for explicit confirmation before proceeding.

### 2. Steering (The Co-Pilot)

The agent halts because it **lacks context** and needs the human to clarify before it can proceed correctly. Examples:

- *"I found three users named John Smith. Which one should I update?"*
- *"The product 'Gaming Chair' doesn't exist. Did you mean 'Office Chair'?"*
- *"This will delete 47 records. Are you sure you want to proceed?"*

Without HITL, the agent either guesses (and may guess wrong) or fails with an error. With HITL, the agent surfaces the ambiguity to the human and waits for a definitive answer.

---

## Architecture

This chapter implements HITL for a **Database Mutator** pipeline — an Orchestrator that can INSERT, UPDATE, and DELETE records in the business database. INSERT operations are safe and execute immediately. UPDATE and DELETE operations are destructive and require explicit human confirmation.

```
User prompt
    ↓
POST /api/orchestrator/mutator { prompt, runId, userId }
    ↓
🤖 Mutator Orchestrator  (streamText with tools)
    │
    ├── write_topic("database-mutation_v0", <user's request>)
    │
    ├── [INSERT path] ─────────────────────────────────────────────────────────
    │   database_mutator_agent(readTopics=["database-mutation_v0"],
    │                          writeTopic="mutation-result_v0")
    │       └── Agent verifies fields, executes INSERT, writes STATUS: success
    │   Orchestrator reads mutation-result_v0, narrates result to user
    │
    └── [UPDATE/DELETE path] ──────────────────────────────────────────────────
        Turn 0 — first pass:
        write_topic("database-mutation_v0", <user's request>)
        write_topic("user-approval_v0", "false")
        database_mutator_agent(readTopics=["database-mutation_v0",
                                           "user-approval_v0"],
                               writeTopic="mutation-result_v0")
            └── Agent finds records, writes STATUS: fail + description of
                what will change (approval = "false" → do not execute)
        Orchestrator reads mutation-result_v0
        request_human_approval(action_summary, question_for_human)
            └── ⚠️ LOOP BREAKS HERE — streamText returns to the browser
                The user sees the question and types a reply
        ↓
        Turn 1 — user replies "yes" or "no":
        write_topic("database-mutation_v1", <original request>)
        write_topic("user-approval_v1", "true" or "false")
        database_mutator_agent(readTopics=["database-mutation_v1",
                                           "user-approval_v1"],
                               writeTopic="mutation-result_v1")
            └── user-approval_v1 = "true"  → executes, writes STATUS: success
                user-approval_v1 = "false" → writes STATUS: fail (cancelled)
        Orchestrator reads mutation-result_v1, narrates final outcome to user
```

### Two Layers of MCP

| MCP Server | Route | Exposes |
|------------|-------|---------|
| **Database Read MCP** | `/api/mcp/database/read/mcp` | `read-inventory`, `read-customers`, `read-sales` (SELECT only) |
| **Database Update MCP** | `/api/mcp/database/update/mcp` | `update-inventory`, `update-customers`, `update-sales` (INSERT/UPDATE/DELETE) |
| **Database Mutator Agent MCP** | `/api/mcp/agents/database-mutator/mcp` | `database_mutator_agent`, `researcher_agent` |

The Mutator Orchestrator connects to the **Database Mutator Agent MCP** server. The Database Mutator Agent (running inside that MCP server) connects to both the **Read MCP** and **Update MCP** servers — it reads first to verify records exist, then writes if approved.

---

## Step 1: The HITL Tool

The key insight is that HITL is implemented as a **tool that intentionally breaks the execution loop**.

In the Vercel AI SDK, `streamText` with `stopWhen: stepCountIs(N)` runs autonomously — the model calls tools, gets results, and keeps going until it produces a final text response or hits the step limit. To pause mid-pipeline and wait for human input, you need the loop to stop and return to the browser.

The `request_human_approval` tool does exactly this: it executes, returns a JSON payload describing the pending action, and then the Orchestrator — following its system prompt instructions — stops streaming and presents the question to the user.

```typescript
// lib/agents/orchestrator/mutator-tools.ts

export const mutatorTools = {
  request_human_approval: tool({
    description:
      "Stop execution and present a confirmation question to the user for a destructive " +
      "UPDATE or DELETE operation. " +
      "This tool does NOT write to any topic. " +
      "After calling this tool, stop and wait for the user's reply. " +
      "On the next turn, call database_mutator_agent with the updated readTopics " +
      "(including user-approval_vX = 'true' or 'false') and writeTopic='mutation-result_vX'.",
    inputSchema: z.object({
      action_summary: z
        .string()
        .describe("A clear description of exactly what records will be modified or deleted."),
      question_for_human: z
        .string()
        .describe(
          "The confirmation question to present to the user " +
          "(e.g. 'Do you want to proceed with deleting these 3 records?').",
        ),
    }),
    execute: async ({ action_summary, question_for_human }) => {
      return JSON.stringify({
        status: "awaiting_human_approval",
        action_summary,
        question_for_human,
        instructions:
          "Present the question_for_human to the user and stop. " +
          "On the next turn, call database_mutator_agent with readTopics including " +
          "user-approval_vX ('true' if approved, 'false' if rejected) " +
          "and writeTopic='mutation-result_vX'.",
      });
    },
  }),
};
```

The tool's `execute` function returns immediately — it does not block, does not write to the database, and does not call any external service. It simply returns a structured JSON payload that tells the Orchestrator what to do next. The Orchestrator reads this payload, narrates the question to the user, and stops streaming.

### Why This Works

The Vercel AI SDK's `streamText` loop continues as long as the model calls tools and gets results. When `request_human_approval` returns, the model has a tool result. The system prompt instructs the Orchestrator to treat this result as a signal to stop and present the question — so the model produces a final text response (the question for the human) and the stream ends.

The browser receives the streamed response, the user reads the question, types a reply, and submits it as a new prompt. The Orchestrator then runs again from scratch with the full conversation history — including the user's approval or rejection — and proceeds to the second pass.

---

## Step 2: The Database Mutator Agent

The `database_mutator_agent` is the specialist that actually reads and writes the database. It is exposed as an MCP tool and runs inside the Database Mutator Agent MCP server.

```typescript
// lib/agents/agents/database-mutator.ts

export async function runDatabaseMutatorAgent(
  runId: string,
  { readTopics, writeTopic: writeTopicName, instructions }: AgentInput,
  parentContext: ReturnType<typeof context.active>,
): Promise<McpToolResult> {
  // Read all input topics (mutation request + optional approval)
  const topicContents = readTopics.map((name) => readTopic(runId, name));
  const topic = topicContents.join("\n\n");

  // Connect to both read and update MCP servers
  const readMcpClient = await createMCPClient({
    transport: { type: "http", url: "http://localhost:3000/api/mcp/database/read/mcp" },
  });
  const updateMcpClient = await createMCPClient({
    transport: { type: "http", url: "http://localhost:3000/api/mcp/database/update/mcp" },
  });

  const dbTools = { ...await readMcpClient.tools(), ...await updateMcpClient.tools() };

  const result = await generateText({
    model: openai(DEFAULT_MODEL),
    system: DATABASE_MUTATOR_SYSTEM_PROMPT,
    prompt: databaseMutatorUserPrompt(topic),
    stopWhen: stepCountIs(15),
    tools: dbTools,
    // ...
  });

  writeTopic(runId, writeTopicName, result.text, "database_mutator_agent");

  return {
    content: [{
      type: "text",
      text: `Done. Read from ${JSON.stringify(readTopics)}, wrote ${result.text.length} chars to "${writeTopicName}".`,
    }],
  };
}
```

The agent's system prompt encodes the approval logic:

```
For UPDATE or DELETE operations:
  - Before anything else, use the read tools to check whether the target record(s) exist.
  - If no matching records are found: report STATUS: fail immediately with a "not found" message.
    Do NOT ask for confirmation — there is nothing to delete or update.
  - First pass (records exist AND user-approval_vX is absent or "false"):
    do NOT execute. Report fail, describe exactly what records will be changed/deleted.
  - Second pass (records exist AND user-approval_vX is present and "true"):
    execute the mutation and report success.
```

The agent always writes a structured result to its `writeTopic`:

```
STATUS: success | fail

SUMMARY:
<One or two sentences describing what was done or why it failed.>

DETAILS:
<For success: list each mutation performed (table, operation, affected rows).>
<For fail: describe what records will be modified and ask for confirmation.>
```

This structured output is what the Orchestrator reads (via `read_topic`) to decide whether to call `request_human_approval`.

---

## Step 3: The Mutator Orchestrator

The Mutator Orchestrator is the conductor. It uses the topic system (from Chapter 1) to pass requests to the `database_mutator_agent` and handles the two-turn approval flow.

```typescript
// lib/agents/orchestrator/mutator.ts

export async function runMutatorOrchestrator({ db, prompt, runId, userId }) {
  const messages = initChatSession(db, runId, prompt);

  const mutatorMcpClient = await createMCPClient({
    transport: {
      type: "http",
      url: "http://localhost:3000/api/mcp/agents/database-mutator/mcp",
      headers: { "x-run-id": runId },
    },
  });

  const mcpAgentTools = await mutatorMcpClient.tools();
  const allTools = {
    ...makeTopicTools(runId),   // write_topic, read_topic, list_topics
    ...mutatorTools,            // request_human_approval
    ...mcpAgentTools,           // database_mutator_agent, researcher_agent
  };

  return streamText({
    model: openai(DEFAULT_MODEL),
    system: mutatorOrchestratorSystemPrompt(toolSummary),
    messages,
    stopWhen: stepCountIs(20),
    tools: allTools,
    // ...
  });
}
```

The Orchestrator's system prompt defines the two-turn pipeline:

**Turn 0 — first pass (UPDATE/DELETE):**
1. `write_topic("database-mutation_v0", <user's request>)`
2. `write_topic("user-approval_v0", "false")`
3. `database_mutator_agent(readTopics=["database-mutation_v0", "user-approval_v0"], writeTopic="mutation-result_v0")`
   → Agent finds records, writes `STATUS: fail` with description of what will change
4. `read_topic("mutation-result_v0")` — Orchestrator reads the result
5. `request_human_approval(action_summary, question_for_human)`
   → **Loop breaks here.** The Orchestrator presents the question and stops.

**Turn 1 — user replies:**
6. `write_topic("database-mutation_v1", <original request>)`
7. `write_topic("user-approval_v1", "true" or "false")`
8. `database_mutator_agent(readTopics=["database-mutation_v1", "user-approval_v1"], writeTopic="mutation-result_v1")`
   → `user-approval_v1 = "true"` → executes, writes `STATUS: success`
   → `user-approval_v1 = "false"` → writes `STATUS: fail (cancelled)`
9. `read_topic("mutation-result_v1")` — Orchestrator reads the result
10. Orchestrator narrates the final outcome.

Each subsequent turn increments the version suffix (`_v2`, `_v3`, …) — the same versioning convention used throughout the topic system.

---

## Step 4: Breaking the Loop in Next.js

The API route is identical to the other Orchestrator routes — it calls `streamText` and returns the stream to the browser:

```typescript
// app/api/orchestrator/mutator/route.ts

export async function POST(req: Request) {
  const { prompt, runId, userId } = await req.json();

  const db = getDb();
  const result = await runMutatorOrchestrator({ db, prompt, runId, userId });
  return result.toUIMessageStreamResponse();
}
```

The key is that `streamText` returns as soon as the model produces a final text response. When the Orchestrator calls `request_human_approval` and then generates its question text, the stream ends naturally — the server is not left hanging.

The frontend uses `useCompletion` from `@ai-sdk/react`, which handles the streaming response and fires `onFinish` when the stream ends:

```typescript
// app/components/HitlAgents.tsx

const { completion, complete, isLoading, error } = useCompletion({
  api: "/api/orchestrator/mutator",
  onFinish: () => {
    if (runId) fetchPersistedMessages(runId);
  },
});

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const userMessage = input.trim();
  if (!userMessage || isLoading || !runId) return;

  setChatHistory((prev) => [...prev, { role: "user", content: userMessage }]);
  setInput("");

  await complete(userMessage, { body: { runId, userId } });
};
```

When the user types a reply (e.g. "yes, proceed"), `handleSubmit` fires again, calling `complete` with the same `runId`. The Orchestrator receives the full conversation history — including the previous turn's question and the user's reply — and proceeds to Turn 1.

---

## Step 5: The Update MCP Server

The Database Update MCP server exposes three write tools — one per business table. Each tool accepts a raw SQL `INSERT`, `UPDATE`, or `DELETE` statement with optional positional parameters:

```typescript
// app/api/mcp/database/update/[transport]/route.ts

server.registerTool(
  "update-inventory",
  {
    title: "Inventory Table (Write)",
    description: UPDATE_TOOL_DESCRIPTIONS.inventory,
    inputSchema: sqlUpdateInputSchema.shape,
  },
  makeMcpSqlUpdateExecute("inventory"),
);
```

The `makeMcpSqlUpdateExecute` factory validates that the SQL is an `INSERT`, `UPDATE`, or `DELETE` (not a `SELECT` or `DROP`) before executing it:

```typescript
// lib/sql-tools.ts

export function makeSqlUpdateExecute(toolName: string) {
  return async ({ sql, params = [] }) => {
    const normalised = sql.trim().toUpperCase();
    if (
      !normalised.startsWith("INSERT") &&
      !normalised.startsWith("UPDATE") &&
      !normalised.startsWith("DELETE")
    ) {
      throw new Error("Only INSERT, UPDATE, and DELETE statements are allowed.");
    }
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { success: true, insertedId: info.lastInsertRowid, changes: info.changes };
  };
}
```

This is a second layer of safety: even if the agent somehow generates a `DROP TABLE` statement, the update tool will reject it before it reaches the database.

---

## Running the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need an `OPENAI_API_KEY` in `.env.local`.

In the **🧑‍💻 HITL** tab, try one of the suggestion prompts:

- *"Add a new product: Bluetooth Speaker, category Electronics, price $79.99"* — requires clarification (INSERT, but supplier field is missing)
- *"Update the price of the USB-C Hub to $27.99"* — requires approval (UPDATE)
- *"Delete all sales records older than 2026-02-01"* — requires approval (DELETE)
- *"Delete the product 'Gaming Chair' from inventory"* — returns "not found" (no records match)

### Example: The Full Approval Flow

**Step 1 — Trigger an UPDATE:**

In the **🧑‍💻 HITL** tab, send:
> *"Update the price of the USB-C Hub to $27.99"*

Watch the right panel's **📡 Topics** tab fill in as the Orchestrator calls the Database Mutator Agent. The agent will write `mutation-result_v0` with `STATUS: fail` and a description of what will change.

The Orchestrator will then ask you for confirmation in the chat panel.

**Step 2 — Approve:**

Type `yes` (or `yes, proceed`) and hit Enter.

The Orchestrator will write `user-approval_v1 = "true"`, call the agent again, and the agent will execute the UPDATE. The `mutation-result_v1` topic card will appear with `STATUS: success`.

**Step 3 — Verify:**

Switch to the **🗄️ View Database** tab → **📦 Inventory**. The USB-C Hub's price should now show $27.99.

**Step 4 — Try a rejection:**

Click **New Run** and send:
> *"Delete all sales records older than 2026-02-01"*

When the Orchestrator asks for confirmation, type `no` (or `cancel`). The agent will write `mutation-result_v1` with `STATUS: fail (cancelled)`. No records will be deleted.

---

## What the UI Shows

### HITL tab

The **🧑‍💻 HITL** tab (`app/components/HitlAgents.tsx`) has the same two-panel layout as the Orchestrator tab:

**Left panel — Chat:**
- User messages appear as blue bubbles on the right
- Orchestrator responses stream in as white bubbles on the left
- The approval question appears as a normal assistant message — the user replies in the same input bar

**Right panel — Topics:**
- Topic cards appear in real time as each agent writes to the database
- For UPDATE/DELETE operations, you'll see the `database-mutation_v0`, `user-approval_v0`, and `mutation-result_v0` cards appear after Turn 0
- After Turn 1, the `_v1` versions appear alongside them
- Each card shows the topic name, agent name, character count, and the full content (expandable)

The topic cards make the approval flow transparent: you can see exactly what the agent wrote in `mutation-result_v0` (the "what will change" description) and what it wrote in `mutation-result_v1` (the final outcome).

### 🔑 User State tab

The **🔑 User State** inner tab (in the header of the HITL view) shows the full user state for the current user — sessions, agent topics, and system prompts. Expanding a HITL session → clicking **📡 Agent Topics** shows all the topic cards for that session, including the full content of each `mutation-result_vX` topic.

### View Database tab

In the **🗄️ View Database** tab → **📦 Inventory** (or **👥 Customers** / **💰 Sales**), you can verify that mutations were applied correctly. The database is updated in real time — switch to this tab after a successful mutation to see the change.

---

## The Topic Flow

Here is the full topic flow for an UPDATE operation:

```
Turn 0:
  write_topic("database-mutation_v0", "Update the price of the USB-C Hub to $27.99")
  write_topic("user-approval_v0", "false")
  database_mutator_agent(readTopics=["database-mutation_v0", "user-approval_v0"],
                         writeTopic="mutation-result_v0")
  read_topic("mutation-result_v0")

  Topics written:
    database-mutation_v0  → "Update the price of the USB-C Hub to $27.99"
    user-approval_v0      → "false"
    mutation-result_v0    → "STATUS: fail\n\nSUMMARY:\nFound 1 matching record...\n\nDETAILS:\n..."

  Orchestrator calls request_human_approval:
    action_summary: "Update USB-C Hub (id=2) unit_price from $34.99 to $27.99"
    question_for_human: "Do you want to proceed with updating the USB-C Hub price?"

  Orchestrator streams: "I found the USB-C Hub. It's currently priced at $34.99.
    Do you want to proceed with updating it to $27.99?"

  ← Stream ends. User sees the question.

Turn 1 (user replies "yes"):
  write_topic("database-mutation_v1", "Update the price of the USB-C Hub to $27.99")
  write_topic("user-approval_v1", "true")
  database_mutator_agent(readTopics=["database-mutation_v1", "user-approval_v1"],
                         writeTopic="mutation-result_v1")
  read_topic("mutation-result_v1")

  Topics written:
    database-mutation_v1  → "Update the price of the USB-C Hub to $27.99"
    user-approval_v1      → "true"
    mutation-result_v1    → "STATUS: success\n\nSUMMARY:\nUpdated 1 record...\n\nDETAILS:\n..."

  Orchestrator streams: "Done! The USB-C Hub price has been updated to $27.99."
```

---

## Example: A Full Multi-Turn Conversation

The four suggestion prompts in the HITL tab each demonstrate a different scenario. Here is what happens when you run each one.

---

### Suggestion 1: "Add a new product: Bluetooth Speaker, category Electronics, price $79.99"

This is the **Steering (Co-Pilot)** pattern. The request is an INSERT, but the supplier field is missing — the agent cannot proceed without it and asks the human to provide it.

**Turn 1 — user sends the prompt:**

```
🤖 Orchestrator is active

I'll store the mutation request and call the Database Mutator Agent.

[write_topic: database-mutation_v0]
[database_mutator_agent: readTopics=["database-mutation_v0"], writeTopic="mutation-result_v0"]
[read_topic: mutation-result_v0]

STATUS: fail

I can't complete this INSERT yet — the supplier field is required but was not provided.
What supplier should I use for the Bluetooth Speaker?
```

**What happened:** The agent checked the `inventory` schema (columns: `id`, `product_name`, `category`, `unit_price`, `stock_quantity`, `supplier`, `created_at`) and found that `supplier` is `NOT NULL`. Rather than guessing, it wrote `STATUS: fail` with a clear explanation of what's missing. The Orchestrator surfaced this to the user.

**Turn 2 — user replies:**

```
User: AudioWorld
```

```
🤖 Orchestrator is active

Got it — supplier is AudioWorld. Retrying the INSERT.

[write_topic: database-mutation_v1]
[database_mutator_agent: readTopics=["database-mutation_v1"], writeTopic="mutation-result_v1"]
[read_topic: mutation-result_v1]

Done! I've added the Bluetooth Speaker to the inventory:
- Product: Bluetooth Speaker
- Category: Electronics
- Price: $79.99
- Supplier: AudioWorld
- Inserted with ID: 11
```

**What happened:** The Orchestrator wrote a new `database-mutation_v1` topic with the complete request (including the supplier), called the agent again, and the INSERT succeeded.

> **Note:** This is the Steering pattern — the agent halted not because the action was dangerous, but because it lacked the information needed to proceed correctly. No `request_human_approval` tool was called; the agent simply wrote `STATUS: fail` with a question, and the Orchestrator relayed it to the user.

---

### Suggestion 2: "Update the price of the USB-C Hub to $27.99"

This is the **Authorization (Gatekeeper)** pattern. The request is an UPDATE — destructive, requires explicit approval.

**Turn 1 — user sends the prompt:**

```
🤖 Orchestrator is active

I'll check the current record before making any changes.

[write_topic: database-mutation_v0]
[write_topic: user-approval_v0 = "false"]
[database_mutator_agent: readTopics=["database-mutation_v0", "user-approval_v0"],
                         writeTopic="mutation-result_v0"]
[read_topic: mutation-result_v0]

I found the USB-C Hub (id=2). It's currently priced at $34.99.

Do you want to proceed with updating the price to $27.99?
```

**What happened:** The agent found the record, wrote `STATUS: fail` (approval = "false" → do not execute), and described exactly what will change. The Orchestrator called `request_human_approval`. The stream ended. The user sees the question.

**Turn 2 — user replies "yes":**

```
🤖 Orchestrator is active

Got it — proceeding with the update.

[write_topic: database-mutation_v1]
[write_topic: user-approval_v1 = "true"]
[database_mutator_agent: readTopics=["database-mutation_v1", "user-approval_v1"],
                         writeTopic="mutation-result_v1"]
[read_topic: mutation-result_v1]

Done! The USB-C Hub price has been updated from $34.99 to $27.99.
You can verify the change in the 🗄️ View Database tab → Inventory.
```

**What happened:** The Orchestrator wrote `user-approval_v1 = "true"` and called the agent again. The agent found the approval topic and executed the UPDATE.

---

### Suggestion 3: "Delete all sales records older than 2026-02-01"

This is the **Authorization (Gatekeeper)** pattern for a bulk DELETE — the most dangerous operation.

**Turn 1 — user sends the prompt:**

```
🤖 Orchestrator is active

Let me check how many records would be affected before proceeding.

[write_topic: database-mutation_v0]
[write_topic: user-approval_v0 = "false"]
[database_mutator_agent: readTopics=["database-mutation_v0", "user-approval_v0"],
                         writeTopic="mutation-result_v0"]
[read_topic: mutation-result_v0]

I found 10 sales records with sale_date before 2026-02-01:
- Sale #1: Wireless Keyboard × 2 — Alice Johnson — 2026-01-05
- Sale #2: USB-C Hub × 5 — Bob Smith — 2026-01-08
- ... (8 more records)

Do you want to proceed with permanently deleting these 10 records?
This action cannot be undone.
```

**Turn 2 — user replies "no":**

```
🤖 Orchestrator is active

Understood — cancelling the deletion.

[write_topic: database-mutation_v1]
[write_topic: user-approval_v1 = "false"]
[database_mutator_agent: readTopics=["database-mutation_v1", "user-approval_v1"],
                         writeTopic="mutation-result_v1"]
[read_topic: mutation-result_v1]

The deletion has been cancelled. No records were modified.
```

**What happened:** The Orchestrator wrote `user-approval_v1 = "false"` and called the agent again. The agent found the rejection and wrote `STATUS: fail (cancelled)` without executing the DELETE.

---

### Suggestion 4: "Delete the product 'Gaming Chair' from inventory"

This is the **"not found" edge case** — the record doesn't exist, so there's nothing to confirm.

**Turn 1 — user sends the prompt:**

```
🤖 Orchestrator is active

Let me check whether this product exists before proceeding.

[write_topic: database-mutation_v0]
[write_topic: user-approval_v0 = "false"]
[database_mutator_agent: readTopics=["database-mutation_v0", "user-approval_v0"],
                         writeTopic="mutation-result_v0"]
[read_topic: mutation-result_v0]

STATUS: fail

No product named 'Gaming Chair' was found in the inventory.
The available furniture products are: Standing Desk Mat, Office Chair, Desk Lamp.

Did you mean one of these? If so, please clarify which product to delete.
```

**What happened:** The agent ran a SELECT query first and found no matching records. Per its system prompt, it wrote `STATUS: fail` with a "not found" message immediately — it did **not** call `request_human_approval`, because there is nothing to approve. The Orchestrator relayed the message to the user.

This is an important distinction: `request_human_approval` is only called when records **exist** and the action is destructive. When records don't exist, the agent reports failure directly and the pipeline ends in a single turn.

---

## Design Decisions

### HITL as a Tool, Not a Middleware Layer

The most important design decision is that HITL is implemented as a **tool** — not as middleware, not as a separate HTTP endpoint, not as a database flag. This keeps the implementation simple and composable:

- The Orchestrator calls `request_human_approval` the same way it calls any other tool
- The tool's `execute` function returns immediately — no blocking, no polling
- The Orchestrator's system prompt instructs it to stop after calling this tool
- The next turn resumes naturally via the existing `useCompletion` flow

This approach works because the Vercel AI SDK's `streamText` loop is stateless between turns. Each call to `POST /api/orchestrator/mutator` receives the full conversation history in `messages` (via `initChatSession`), so the Orchestrator always has the full context — including the previous turn's question and the user's reply.

### The Topic System as the Approval Channel

The user's approval is passed to the `database_mutator_agent` via the topic system — not as a tool parameter, not as a system prompt injection, but as a named topic (`user-approval_vX`) that the agent reads alongside the mutation request.

This is consistent with how all inter-agent communication works in this project. It also means the approval decision is **persisted in the database** — you can inspect `user-approval_v0` and `user-approval_v1` in the **🔑 User State** tab to see exactly what was approved and when.

### Two-Pass Architecture

The agent runs twice for UPDATE/DELETE operations:

1. **First pass** (approval = "false"): reads the database, describes what will change, does NOT execute
2. **Second pass** (approval = "true"): reads the database again, executes the mutation

Running the read query twice (once to describe, once to execute) is intentional. It ensures the agent is working with the current state of the database at execution time — not a stale snapshot from the first pass. If another process modified the records between Turn 0 and Turn 1, the second pass will reflect that.

### Version Suffixes for Multi-Turn Conversations

Each turn increments the version suffix: `_v0` for Turn 0, `_v1` for Turn 1, `_v2` for Turn 2, and so on. This means:

- All intermediate states are preserved in the database
- You can inspect the full history of a multi-turn approval flow in the **🔑 User State** tab
- The Orchestrator never overwrites a previous version — it always writes to a new slot

This is the same versioning convention used throughout the topic system (see Chapter 1).

### INSERT vs. UPDATE/DELETE

INSERT operations execute immediately without approval. This is a deliberate policy decision: adding new records is generally safe (it can be undone by deleting the new record), while modifying or deleting existing records is destructive and harder to reverse.

If your use case requires approval for INSERT operations too (e.g. adding a new user to a production system), you can extend the Orchestrator's system prompt to treat INSERT the same as UPDATE/DELETE.

---

## The Stateless Advantage

The Vercel AI SDK's approach to HITL is fundamentally stateless — and that is a feature, not a limitation.

Other frameworks (LangGraph, AutoGen, CrewAI) implement HITL by pausing a running process and waiting for a signal to resume. This requires a persistent state store, a background worker, and a mechanism to wake the process back up. It is powerful for long-running workflows that span hours or days, but it adds significant infrastructure complexity.

The Vercel AI SDK approach is different: the "pause" is just the HTTP stream ending, and the "resume" is the next HTTP request. There is no running process to keep alive, no state to serialize, no worker to wake up. The entire conversation state lives in the database as a JSON array of messages — and every new request reconstructs the full context from that array.

This stateless architecture is more versatile than it might appear:

- **It scales horizontally.** Any server instance can handle any turn of the conversation — there is no affinity to a specific process or machine.
- **It survives restarts.** If the server restarts between Turn 0 and Turn 1, the conversation resumes exactly where it left off on the next request.
- **It composes naturally.** The approval flow is just a multi-turn conversation. The same `useCompletion` hook, the same API route, the same message history — no special HITL infrastructure required.
- **It is inspectable.** Every turn is a normal HTTP request with a normal response. You can replay any turn by re-sending the same request body.

Because the conversation state is persisted in the database as a JSON array of messages, the "pause" can last indefinitely — hours, days, or longer. When the user eventually returns and submits their reply, the next HTTP request reconstructs the full context from the database and the pipeline resumes exactly where it left off.

---

## Further Exploration: Structured Approval UI

The current implementation presents the approval question as plain text in the chat panel. The user types "yes" or "no" and the Orchestrator interprets their reply. This works, but it requires the user to type a response and the Orchestrator to parse natural language.

A more polished approach is to have the `request_human_approval` tool return a **structured JSON payload** that the frontend can render as interactive UI elements — for example, a pair of **Yes** / **No** buttons.

The tool already returns JSON:

```typescript
execute: async ({ action_summary, question_for_human }) => {
  return JSON.stringify({
    status: "awaiting_human_approval",
    action_summary,
    question_for_human,
  });
},
```

The Orchestrator currently narrates this as plain text. But if the frontend detected the `awaiting_human_approval` status in the streamed response, it could render the question differently:

```
┌─────────────────────────────────────────────────────────┐
│ ⚠️  Confirmation Required                               │
│                                                         │
│ Update USB-C Hub (id=2) unit_price from $34.99 to $27.99│
│                                                         │
│ Do you want to proceed?                                 │
│                                                         │
│  [ ✓ Yes, proceed ]    [ ✗ No, cancel ]                 │
└─────────────────────────────────────────────────────────┘
```

Clicking **Yes** would call `complete("yes, proceed", { body: { runId, userId } })` automatically — no typing required. Clicking **No** would call `complete("no, cancel", ...)`.

To implement this, you would:

1. Have the Orchestrator include a machine-readable marker in its response when it is awaiting approval — for example, a JSON block at the end of the streamed text
2. In the `ChatPanel` component, parse the last assistant message for this marker and render the approval buttons instead of (or alongside) the plain text
3. Wire the buttons to call `complete` with the appropriate reply

This keeps the backend completely unchanged — the approval flow is still a two-turn conversation, the topic system still carries the approval decision, and the Orchestrator still interprets the user's reply. The only change is in how the frontend presents the question to the user.

---

## Further Reading

- [Vercel AI SDK — Human in the Loop](https://ai-sdk.dev/docs/ai-sdk-core/agents#human-in-the-loop)
- [LangGraph — Human-in-the-Loop](https://langchain-ai.github.io/langgraph/concepts/human_in_the_loop/)
- [Anthropic — Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [OpenAI — Practical Guide to Building Agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)

---

**[← Back to README](../README.md)** · **[← Chapter 4](chapter-04-checkpointing.md)** · **[Next: Chapter 6 — Conclusion →](chapter-06-conclusion.md)**
