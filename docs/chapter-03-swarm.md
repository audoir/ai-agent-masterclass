# Chapter 3 — Swarm Architecture

In Chapters 1 and 2 we built an Orchestrator that drives a fixed pipeline of sub-agents and remembers user preferences across sessions. The Orchestrator is a **hub-and-spoke** model: one central agent holds all the context, decides what to do next, and delegates to specialists one at a time.

This chapter introduces a fundamentally different architecture: the **Swarm**. Instead of a central boss, you have a team of autonomous specialists that hand off control to each other directly — no middleman required.

---

## Background: Why Swarms?

The Orchestrator pattern works well for predictable, linear pipelines. But it has structural limitations as complexity grows:

**The context bottleneck.** The Orchestrator must hold the full context of every sub-agent's work in its own context window. As the pipeline grows, so does the token count — and the cost.

**Single point of failure.** If the Orchestrator makes a bad routing decision, the whole pipeline breaks. There is no recovery path.

**No active agent memory.** The Orchestrator can dynamically decide which agent to call and in what order — it is not topologically rigid. But it has no concept of a "currently active" specialist. Every follow-up message goes back to the Orchestrator, which has to re-read the full context and re-plan from scratch, even if the right answer is simply "continue where we left off with the researcher."

The Swarm architecture fixes all three by distributing the decision-making:

- Each agent is autonomous and decides for itself what to do next
- Only one agent is "active" at any given time
- When an agent finishes its work, it calls a **handoff tool** to pass control to the next specialist
- The conversation history and database state are shared — no agent needs to re-read what the previous one did
- The system remembers which agent was last active, so follow-up messages go directly to the right agent

This mirrors how human organizations work: a researcher hands a report to a writer, who hands a draft to an editor — no manager required.

---

## Architecture

```
User prompt
    ↓
POST /api/swarm { prompt, runId, userId }
    ↓
Swarm Loop (app/api/swarm/route.ts)
    │
    ├── Start: researcher (first prompt) or last active agent (follow-up)
    │
    ├── 🔍 Researcher Agent
    │       ├── Queries business database via MCP (inventory, customers, sales)
    │       ├── Writes research findings to chat_sessions.topics (e.g. "research_v0")
    │       └── Calls handoff(writer, summary, instructions, readTopics)
    │
    ├── ✍️ Writer Agent
    │       ├── Reads research from topics via list_topics() / read_topic()
    │       ├── Writes blog post draft to topics (e.g. "draft_v0")
    │       └── Calls handoff(editor, summary, instructions, readTopics)
    │
    └── 📝 Editor Agent
            ├── Reads draft from topics via list_topics() / read_topic()
            ├── Writes polished article to topics (e.g. "final_v0")
            └── Responds with text (no handoff = done)
    ↓
Final response streamed to browser via SSE
```

### Topology

The swarm has a fixed topology defined in `lib/agents/swarm/config.ts`:

```
researcher ──► writer
writer     ──► researcher | editor
editor     ──► researcher
```

Each agent can only hand off to the agents listed in its `handoffs` array. This prevents runaway loops and makes the routing predictable.

---

## The Handoff Tool

The core primitive of the swarm is the **handoff tool**. Every agent has access to it. When an agent calls `handoff()`, it:

1. Saves its output to a named topic in the session's topics JSON
2. Passes control to the next agent with instructions and a list of topic names to read

```typescript
// lib/agents/swarm/tools.ts

export function buildHandoffTool({
  agentName,
  onHandoff,
}: {
  agentName: SwarmAgentName;
  onHandoff: (decision: SwarmAgentHandoffResult) => void;
}) {
  const config = SWARM_AGENT_CONFIG[agentName];

  return tool({
    description:
      "Hand off control to another agent. Call this when your work is done and another agent should continue.",
    inputSchema: z.object({
      agentName: z
        .enum(config.handoffs as [SwarmAgentName, ...SwarmAgentName[]])
        .describe(`The agent to hand off to. Allowed values: ${config.handoffs.join(", ")}`),
      summary: z
        .string()
        .describe(
          "A brief, conversational summary of what you did and why you are handing off.",
        ),
      instructions: z
        .string()
        .describe(
          "Clear instructions for the next agent, including any relevant output from your work.",
        ),
      readTopics: z
        .array(z.string())
        .describe("Named topic slots the next agent should read its input from."),
    }),
    execute: async ({ agentName: nextAgent, summary, instructions, readTopics }) => {
      onHandoff({
        nextAgent: nextAgent as SwarmAgentName,
        summary,
        instructions,
        readTopics,
      });
      return `Handing off to ${nextAgent}.`;
    },
  });
}
```

The handoff is captured via a callback closure. When `generateText` resolves, the swarm loop checks whether a handoff was requested and routes accordingly.

---

## The Topic System

Agents communicate through the **topic store** — the `topics` JSON object in `chat_sessions`. Each agent chooses its own topic name.

```typescript
// lib/agents/swarm/tools.ts

export function buildWriteTopicTool({
  runId,
  agentName,
}: {
  runId: string;
  agentName: SwarmAgentName;
}) {
  return tool({
    description: "Write your output to the topic database under a name you choose.",
    inputSchema: z.object({
      topicName: z.string().describe('The name for this topic (e.g. "research_v0", "draft_v0", "final_v0").'),
      content: z.string().describe("The content to write to the topic."),
    }),
    execute: async ({ topicName, content }) => {
      writeTopic(runId, topicName, content, agentName);
      return `Wrote ${content.length} chars to topic "${topicName}".`;
    },
  });
}
```

Topic names use a version suffix (`_v0`, `_v1`, etc.). When an agent revises existing content, it increments the version rather than overwriting — so the full history is preserved.

---

## The Agent Registry

Every time an agent is invoked, it registers itself in `chat_sessions.agent_registry` — a JSON object keyed by agent name. This is how the swarm tracks which agent is currently active and what system prompt it used.

The registry structure:

```json
{
  "last_finished_agent": "editor",
  "registry": {
    "researcher": {
      "status": "done",
      "error_message": null,
      "runs": [
        { "system_prompt": "...", "started_at": "2026-06-05 10:00:00", "finished_at": "2026-06-05 10:00:05" }
      ]
    },
    "writer": {
      "status": "done",
      "error_message": null,
      "runs": [
        { "system_prompt": "...", "started_at": "2026-06-05 10:00:06", "finished_at": "2026-06-05 10:00:12" }
      ]
    },
    "editor": {
      "status": "done",
      "error_message": null,
      "runs": [
        { "system_prompt": "...", "started_at": "2026-06-05 10:00:13", "finished_at": "2026-06-05 10:00:20" }
      ]
    }
  }
}
```

The top-level `last_finished_agent` field records which agent most recently completed. Each agent entry in `registry` has a `status`, an optional `error_message`, and a `runs` array — one entry per invocation. An agent may be invoked multiple times in the same session (e.g. the researcher runs again on a follow-up), so each invocation appends a new run object.

```typescript
// lib/agents/agents/registry.ts

export function registerAgent(runId: string, agentName: string): void {
  const data = getRegistryData(runId);
  if (!data.registry[agentName]) {
    data.registry[agentName] = { status: "running", error_message: null, runs: [] };
  }
  data.registry[agentName].status = "running";
  data.registry[agentName].runs.push({
    system_prompt: null,
    started_at: now(),
    finished_at: null,
  });
  saveRegistryData(runId, data);
}

export function finishAgent(runId: string, agentName: string): void {
  const data = getRegistryData(runId);
  const entry = data.registry[agentName];
  entry.status = "done";
  entry.runs[entry.runs.length - 1].finished_at = now();
  data.last_finished_agent = agentName;  // ← updated for follow-up routing
  saveRegistryData(runId, data);
}

export function setAgentSystemPrompt(runId: string, agentName: string, systemPrompt: string): void {
  const data = getRegistryData(runId);
  const entry = data.registry[agentName];
  entry.runs[entry.runs.length - 1].system_prompt = systemPrompt;
  saveRegistryData(runId, data);
}
```

---

## The Swarm Loop

The swarm loop in `app/api/swarm/route.ts` is the engine that drives the pipeline:

```typescript
// app/api/swarm/route.ts

// Determine starting agent:
//   - First prompt: start at "researcher"
//   - Follow-up: resume from the last agent that finished (from registry)
const lastFinished = getLastFinishedAgent(runId);

let agentName: SwarmAgentName = lastFinished
  ? (lastFinished as SwarmAgentName)
  : "researcher";

let input: SwarmAgentInput = {
  instructions: prompt,
  readTopics: [],
};

let hops = 0;

while (hops < MAX_HOPS) {
  hops++;

  const result: SwarmAgentResult = await runSwarmAgent({ db, runId, agentName, input });

  // After each agent turn, send the updated messages snapshot via SSE
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
```

Key design decisions:

- **No central orchestrator.** The loop is just a `while` — it runs agents until one responds without calling `handoff`.
- **Follow-up routing.** On a follow-up prompt, the loop resumes from the last agent that ran. The editor receives the follow-up first and decides whether to handle it or hand off to the researcher.
- **SSE streaming.** After each agent turn, the updated message list is pushed to the browser via Server-Sent Events. The UI updates in real time as each agent completes.

---

## Agent Configuration

Each agent's allowed handoffs and system prompt are defined in `lib/agents/swarm/config.ts`:

```typescript
// lib/agents/swarm/config.ts

export const SWARM_AGENT_CONFIG: Record<SwarmAgentName, SwarmAgentConfig> = {
  researcher: {
    systemPrompt: SWARM_RESEARCHER_SYSTEM_PROMPT,
    handoffs: ["writer"],
    // Researcher gets access to the business database via MCP
    extraTools: async () => {
      const { createMCPClient } = await import("@ai-sdk/mcp");
      const mcpClient = await createMCPClient({
        transport: { type: "http", url: "http://localhost:3000/api/mcp/database/read/mcp" },
      });
      return mcpClient.tools();
    },
  },
  writer: {
    systemPrompt: SWARM_WRITER_SYSTEM_PROMPT,
    handoffs: ["researcher", "editor"],
  },
  editor: {
    systemPrompt: SWARM_EDITOR_SYSTEM_PROMPT,
    handoffs: ["researcher"],
  },
};
```

The `extraTools` factory is called at runtime, so async setup (like connecting to an MCP server) is supported. The researcher gets the full database MCP toolset; the writer and editor do not.

---

## Running the App

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You need an `OPENAI_API_KEY` in `.env.local`:

```
OPENAI_API_KEY=sk-...
```

In the **🐝 Swarm Agents** tab, try one of the suggestion prompts:

- *"Write a blog post about our best-selling electronics"*
- *"Create a report on customer purchasing trends"*
- *"Analyze our top revenue-generating products"*
- *"Write about our most loyal customers and what they buy"*

---

## Example: A Full Multi-Turn Conversation

Here is a real example of the swarm in action across three turns.

### Turn 1: "Write a blog post about our best-selling electronics"

```
🔍 researcher agent is active
✍️ writer agent is active
📝 editor agent is active

↪ I researched the top electronics products by revenue. Handing off to the writer.
↪ I drafted a blog post about the top electronics. Handing off to the editor.

Done. I wrote the final article to topic: final_v0
```

**What happened:**
1. Researcher queries the database → finds top electronics by sales → writes to `research_v0` → hands off to writer
2. Writer reads `research_v0` → writes a blog post → writes to `draft_v0` → hands off to editor
3. Editor reads `draft_v0` → polishes the article → writes to `final_v0` → responds with text (no handoff = done)

### Turn 2: "Who bought the USB-C Hub?"

```
📝 editor agent is active  ← follow-up goes to last active agent (editor)

↪ I don't have database access. Handing off to the researcher.

🔍 researcher agent is active

The USB-C Hub (product ID 2) was purchased by:
- Bob Smith (New York) — 5 units on 2026-01-08
- Alice Johnson (San Francisco) — 2 units on 2026-02-25
```

**What happened:**
1. Follow-up goes to the editor (last active agent)
2. Editor recognises this is a data question → hands off to researcher
3. Researcher queries the database → finds the buyers → responds with text (no handoff = done, pure data question)

### Turn 3: "OK add this info to the blog"

```
🔍 researcher agent is active  ← follow-up goes to last active agent (researcher)

↪ I gathered the USB-C Hub buyer data. Handing off to the writer.

✍️ writer agent is active

↪ I updated the blog post to include the USB-C Hub buyer information. Handing off to the editor.

📝 editor agent is active

Done. I wrote the final article to topic: final_v1
```

**What happened:**
1. Follow-up goes to the researcher (last active agent)
2. Researcher writes the buyer data to `research_v1` → hands off to writer
3. Writer reads `research_v1` and the existing `final_v0` → writes an updated post to `draft_v1` → hands off to editor
4. Editor reads `draft_v1` → polishes → writes to `final_v1` → responds with text (done)

---

## What the UI Shows

### Swarm Agents tab

**Left panel — Chat:**
- A static "🔍 researcher agent is active" pill appears immediately when the run starts
- As agents hand off, pills appear: "✍️ writer agent is active", "📝 editor agent is active"
- Handoff summaries appear as amber bubbles (the agent's brief description of what it did)
- The final response appears as a white bubble

**Right panel — Topics:**
- Topic cards appear in real time as each agent writes to the database
- Each card shows the topic name, agent name, character count, and the full content (expandable)

### 🔑 User State tab

In the **🔑 User State** inner tab of the Swarm Agents view, expanding the user → expanding a session → clicking **🤖 Agent Registry** shows:
- Each agent with its current status (running / done / error) and run count
- Expanding a run shows the timestamps and the full system prompt used for that invocation
- If an agent ran multiple times in the same session (e.g. researcher on a follow-up), each invocation appears as a separate run entry

---

## Orchestrator vs. Swarm: Analysis

Both architectures solve the same problem — coordinating multiple specialist agents — but they make different trade-offs.

### Orchestrator (Hub-and-Spoke)

```
User → Orchestrator → Researcher
                    → Writer
                    → Editor
                    → User
```

**Advantages:**
- **Single-purpose agents.** Each agent has one job and one job only — the researcher researches, the writer writes, the editor edits. This follows the single-responsibility principle: agents are easy to design, test, and maintain in isolation.
- **Predictable.** The Orchestrator controls the sequence. You always know what will happen next.
- **Easy to debug.** One agent makes all routing decisions. If something goes wrong, you know where to look.
- **Centralised context.** The Orchestrator sees everything. It can make nuanced decisions based on the full picture.

**Disadvantages:**
- **Context bloat.** Every sub-agent's output passes through the Orchestrator's context window. As the pipeline grows, token costs grow with it (although the topic system helps reduce this).
- **Single point of failure.** A bad routing decision by the Orchestrator breaks the whole pipeline.
- **No memory of active agent.** Follow-up messages always go to the Orchestrator, which has to re-read the full context and re-plan from scratch.

### Swarm (Peer-to-Peer)

```
User → Researcher → Writer → Editor → User
         ↑                      ↓
         └──────────────────────┘
```

**Advantages:**
- **No context bloat.** Each agent only sees its own context. The swarm loop is thin — it just passes instructions and topic names between agents.
- **Resilient.** If one agent makes a bad decision, the next agent can correct it. There is no single point of failure.
- **Dynamic routing.** Agents decide for themselves what to do next. Follow-up messages go directly to the last active agent, which routes them appropriately.
- **Scalable.** Adding a new specialist is as simple as adding a new entry to `SWARM_AGENT_CONFIG` and updating the `handoffs` arrays of the agents that should be able to reach it.
- **Active agent memory.** The `agent_registry` JSON in `chat_sessions` tracks which agent was last active. Follow-up messages resume from the right agent automatically.

**Disadvantages:**
- **Agents are more complex.** In the Orchestrator model, each agent has a single purpose. In the swarm, every agent must also make routing decisions — it needs to know when its work is done, which agent to hand off to, and what instructions to pass along. This dual responsibility makes each agent harder to design, prompt-engineer, and maintain. A vague or incomplete system prompt leads to agents doing work outside their domain (e.g. the researcher writing articles instead of handing off to the writer).
- **Harder to predict.** Each agent makes its own routing decisions. The pipeline can take unexpected paths, especially with ambiguous prompts.
- **Harder to debug.** When something goes wrong, you need to inspect each agent's decision individually. The agent registry and system prompt viewer in the database tab help with this.
- **Potential for loops.** Without a topology constraint (the `handoffs` array) and a hop limit (`MAX_HOPS`), agents could hand off to each other indefinitely.

### When to Use Each

**Start with the Orchestrator. Don't reach for a swarm unless you have a specific reason to.**

The Orchestrator is easier to design, easier to maintain, and easier to observe. Each agent has a single purpose, the routing logic lives in one place, and you can trace exactly what happened and why. If you need to scale, you can nest Orchestrators — an outer Orchestrator that delegates to inner Orchestrators, each managing their own sub-pipeline — without ever introducing the complexity of peer-to-peer handoffs.

Reach for a swarm when you have a concrete problem that the Orchestrator genuinely cannot solve well:

| Problem | Why swarm helps |
|---------|----------------|
| The Orchestrator's context window is growing too large because sub-agent outputs are too big | Each swarm agent only sees its own context — no central accumulation |
| Follow-up messages need to resume with the last active specialist, not re-route through a manager | The `agent_registry` JSON tracks the active agent; follow-ups go directly to them |
| You have many specialists with complex, dynamic routing that is hard to encode in a single prompt | Each agent decides its own next step based on what it knows |

If none of these apply, the Orchestrator is almost certainly the better choice.

---

## Further Reading

- [Strands Agents SDK — Swarm Pattern](https://strandsagents.com/docs/user-guide/concepts/multi-agent/swarm/)
- [LangGraph Swarm](https://reference.langchain.com/python/langgraph-swarm)
- [OpenAI Swarm (reference implementation)](https://github.com/openai/swarm)

---

**[← Back to README](../README.md)** · **[← Chapter 2](chapter-02-long-term-memory.md)** · **[Next: Chapter 4 — Checkpointing →](chapter-04-checkpointing.md)**
