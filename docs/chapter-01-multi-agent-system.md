# Chapter 1 — Multi-Agent System (Recap)

> **This is a recap chapter.** This project is a continuation of the [Advanced AI Agent Tutorial](https://github.com/audoir/advanced-ai-tutorial). The multi-agent system described here combines what was Chapter 1 (Orchestrator + SubAgents) and Chapter 4 (Agent Topics) of that tutorial into a single, unified implementation. If you completed that tutorial, this chapter explains what's already in the codebase and how the pieces fit together.

---

## What's in This Project

The app has two tabs:

| Tab | Component | Description |
|-----|-----------|-------------|
| 🗄️ **View Database** | `app/components/DatabaseView.tsx` | Browse the in-memory SQLite database — inventory, customers, and sales (seeded business tables) |
| 🤖 **Orchestrator** | `app/components/OrchestratorAgents.tsx` | An Orchestrator Agent that delegates to 3 specialist sub-agents via MCP tool calls, with outputs persisted as named topics in the session |

> **User state** (sessions, memory, agent topics) is accessible directly in each agent tab via the **🔑 User State** inner tab.

---

## Architecture

```
User prompt
    ↓
POST /api/orchestrator/default { prompt, runId, userId }
    ↓
🤖 Orchestrator Agent  (gpt + tools from /api/mcp/agents/orchestrator/mcp)
    │
    ├── write_topic("research_topic_v0", <user's prompt>)
    │
    ├── researcher_agent(readTopics=["research_topic_v0"], writeTopic="research_v0")
    │       └── Researcher Agent queries /api/mcp/database/read/mcp (SQL tools)
    │           → writes research report to chat_sessions.topics JSON
    │           → returns short confirmation
    │
    ├── writer_agent(readTopics=["research_v0"], writeTopic="draft_v0")
    │       └── Writer Agent reads research from DB, writes blog post draft
    │           → returns short confirmation
    │
    └── editor_agent(readTopics=["draft_v0"], writeTopic="final_v0")
            └── Editor Agent reads draft from DB, writes polished final article
                → returns short confirmation
    ↓
Orchestrator streams narration to user
```

### Two Layers of MCP

| MCP Server | Route | Exposes |
|------------|-------|---------|
| **Database MCP** | `/api/mcp/database/read/mcp` | `read-inventory`, `read-customers`, `read-sales` SQL tools (SELECT only) |
| **Topic Agent MCP** | `/api/mcp/agents/orchestrator/mcp` | `researcher_agent`, `writer_agent`, `editor_agent` |

The Orchestrator connects to the **Topic Agent MCP** server. The Researcher Agent (running inside that MCP server) connects to the **Database MCP** server to query real data. The `write_topic`, `read_topic`, and `list_topics` tools are inline AI SDK tools — no MCP round-trip needed for simple DB helpers.

---

## The Agent Topics Pattern

This project uses the **agent topics** pattern from Chapter 4 of the Advanced AI Agent Tutorial. Instead of passing large content strings between agents through the Orchestrator's context window, each agent reads its input from and writes its output to a named slot stored as JSON in the `chat_sessions` table.

**Without topics (Chapter 1 of the tutorial):**
```
Orchestrator context grows with each step:

[tool call: researcher_agent("electronics")]
[tool result: "## Research Report\n\n...(2,000 chars)..."]
[tool call: writer_agent("electronics", "## Research Report\n\n...(2,000 chars pasted again)...")]
[tool result: "# The Electronics Revolution\n\n...(3,000 chars)..."]
[tool call: editor_agent("# The Electronics Revolution\n\n...(3,000 chars pasted again)...")]
```

**With topics (this project):**
```
Orchestrator context stays small:

[tool call: write_topic("research_topic_v0", "best-selling electronics")]
[tool result: "Wrote 28 chars to topic research_topic_v0"]
[tool call: researcher_agent(readTopics=["research_topic_v0"], writeTopic="research_v0")]
[tool result: "Done. Read from ["research_topic_v0"], wrote 1842 chars to research_v0."]
[tool call: writer_agent(readTopics=["research_v0"], writeTopic="draft_v0")]
[tool result: "Done. Read from ["research_v0"], wrote 2931 chars to draft_v0."]
[tool call: editor_agent(readTopics=["draft_v0"], writeTopic="final_v0")]
[tool result: "Done. Read from ["draft_v0"], wrote 3204 chars to final_v0."]
```

The agents read and write the actual content directly from/to the database. The Orchestrator only sees short confirmation messages.

### Storage: `chat_sessions.topics`

Topics are stored as a JSON object in the `topics` column of `chat_sessions`:

```json
{
  "research_topic_v0": { "content": "best-selling electronics", "agent_name": "orchestrator", "created_at": "..." },
  "research_v0":       { "content": "## Research Report\n\n...", "agent_name": "researcher_agent", "created_at": "..." },
  "draft_v0":          { "content": "# The Electronics Revolution\n\n...", "agent_name": "writer_agent", "created_at": "..." },
  "final_v0":          { "content": "# The Electronics Revolution\n\n...", "agent_name": "editor_agent", "created_at": "..." }
}
```

The key is the topic name; the value contains the content, the agent that wrote it, and a timestamp.

### Why Topics?

| Benefit | How topics provide it |
|---------|----------------------|
| **No context bloat** | Only the topic name (a short string) is passed between agents. The actual content stays in the DB. |
| **Persistence** | Every intermediate output is stored in SQLite. If the pipeline fails, completed stages are preserved. |
| **Resumability** | A failed pipeline can be resumed from the last successful topic write — no need to re-run earlier agents. |
| **Inspectability** | Any topic can be viewed in the **🔑 User State** tab of each agent view. |
| **Versioning** | Topic names include a version suffix (`_v0`, `_v1`, etc.) — the Orchestrator increments the version for refinements, never overwriting previous versions. |
| **Live progress** | The UI polls `GET /api/orchestrator/default?runId=...` every second to show which topics have been written as the pipeline runs. |

---

## Observability

The project includes OpenTelemetry tracing. Every `generateText` and `streamText` call emits spans automatically via the AI SDK's `experimental_telemetry` option. The Orchestrator also propagates the OTel trace context to the Agent MCP server via W3C `traceparent` headers, so all four agents appear in a single unified trace in Jaeger.

To view traces locally:

```bash
docker run --rm --name jaeger \
  -p 16686:16686 -p 4317:4317 -p 4318:4318 \
  cr.jaegertracing.io/jaegertracing/jaeger:2.18.0
```

Open [http://localhost:16686](http://localhost:16686) and select the `ai-agent-masterclass` service.

---

## What Happens When You Send a Prompt

Here's the full request flow for *"Write a blog post about our best-selling electronics"*:

1. **Browser** → `POST /api/orchestrator/default` `{ prompt, runId, userId }`
2. **Orchestrator** calls `write_topic("research_topic_v0", "best-selling electronics")`
3. **Orchestrator** calls `researcher_agent(readTopics=["research_topic_v0"], writeTopic="research_v0")`
4. **Researcher Agent** reads `research_topic_v0` from the session's topics JSON, connects to Database MCP, queries `inventory` and `sales` SQL tools, writes a research report to `research_v0`
5. **Orchestrator** calls `writer_agent(readTopics=["research_v0"], writeTopic="draft_v0")`
6. **Writer Agent** reads `research_v0` from the session's topics JSON, generates a blog post draft, writes it to `draft_v0`
7. **Orchestrator** calls `editor_agent(readTopics=["draft_v0"], writeTopic="final_v0")`
8. **Editor Agent** reads `draft_v0` from the session's topics JSON, polishes the article, writes it to `final_v0`
9. **Orchestrator** streams a final summary to the browser
10. **UI** polls `GET /api/orchestrator/default?runId=...` every second and renders all 4 topic cards

Each step is narrated by the Orchestrator in the chat panel, and topic cards appear in the right panel as they are written to the database.

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

In the **🤖 Orchestrator** tab, try one of the suggestion prompts:

- *"Write a blog post about our best-selling electronics"*
- *"Create a report on customer purchasing trends"*
- *"Analyze our top revenue-generating products"*
- *"Write about our most loyal customers and what they buy"*

Hit Enter and watch the Orchestrator narrate each step as it calls the Researcher, Writer, and Editor agents in sequence. Topic cards appear on the right as each agent writes its output to the database.

After the pipeline completes, click the **🔑 User State** tab (in the header of the Orchestrator view) to see your session and all the topics written during the run.

---

**[← Back to README](../README.md)** · **[Next: Chapter 2 — Long-Term Memory →](chapter-02-long-term-memory.md)**
