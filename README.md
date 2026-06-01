# AI Agent Masterclass

> **Prerequisites:** This project is a continuation of the [Advanced AI Agent Tutorial](https://github.com/audoir/advanced-ai-tutorial), which covers multi-agent systems, observability with OpenTelemetry, evals, agent topics, and data pipelines. Complete that tutorial first before proceeding here.

A hands-on Next.js project for building on top of advanced AI agent concepts.

## Getting Started

```
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

> **Note:** You need an `OPENAI_API_KEY` environment variable set. Create a `.env.local` file:
>
> ```
> OPENAI_API_KEY=sk-...
> ```

---

## Chapters

| Chapter | Description |
|---------|-------------|
| [Chapter 1 — Multi-Agent System](docs/chapter-01-multi-agent-system.md) | Recap of the Orchestrator + SubAgents system with agent topics — the foundation this project builds on |
| [Chapter 2 — Long-Term Memory](docs/chapter-02-long-term-memory.md) | Episodic and semantic memory agents that persist user preferences across sessions and inject them into the Orchestrator's system prompt |
| [Chapter 3 — Swarm](docs/chapter-03-swarm.md) | A different multi-agent architecture where agents can hand off to each other directly |
| [Chapter 4 — State Checkpointing](docs/chapter-04-checkpointing.md) | Snapshot conversation state before every step, roll back to any checkpoint, and re-run the pipeline with a new prompt — time travel debugging for AI agents |
| [Chapter 5 — Human-in-the-Loop](docs/chapter-05-hitl.md) | HITL for a database mutation pipeline — INSERT executes immediately, UPDATE/DELETE require explicit human approval via a two-turn confirmation flow |
| [Chapter 6 — Conclusion](docs/chapter-06-conclusion.md) | Key lessons from the project — long-term memory, why to prefer Orchestrators over swarms, checkpointing, HITL, stateless architecture, and a practical guide to building agentic systems |

## What's Included

| Tab | Description |
|-----|-------------|
| 🗄️ View Database | Browse the in-memory SQLite database — inventory, customers, sales, users, sessions, agent topics, and the agent registry |
| 🤖 Orchestrator | An Orchestrator Agent that delegates to 3 specialist agents (Researcher → Writer → Editor) via MCP tool calls, with outputs persisted as named topics in the database |
| 🐝 Swarm Agents | A swarm of autonomous agents (Researcher, Writer, Editor) that hand off control to each other directly — no central orchestrator |
| 🔖 Checkpoints | State checkpointing with time travel debugging — stop a run mid-pipeline, roll back to any step, and rerun with a new prompt |
| 🧑‍💻 HITL | Human-in-the-Loop database mutations — INSERT executes immediately, UPDATE/DELETE require explicit human approval before executing |

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `ai` | Vercel AI SDK — `generateText`, `streamText` |
| `@ai-sdk/openai` | OpenAI provider |
| `@ai-sdk/react` | React hooks — `useCompletion` |
| `@ai-sdk/mcp` | MCP client for the AI SDK |
| `mcp-handler` | MCP server handler for Next.js |
| `@modelcontextprotocol/sdk` | Official MCP TypeScript SDK |
| `better-sqlite3` | Synchronous SQLite driver |
| `zod` | Schema validation for tool inputs |
