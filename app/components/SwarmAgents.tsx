"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/app/components/chat/useSession";
import { useTopicsStream } from "@/app/hooks/useTopicsStream";
import { useSwarmMessages } from "@/app/hooks/useSwarmMessages";
import { TopicCard, type TopicData } from "./orchestrator/TopicCard";
import { agentLabel, type SwarmChatMessage } from "@/app/hooks/useSwarmMessages";
import { useDatabaseStream } from "@/app/hooks/useDatabaseStream";
import { SingleUserView } from "./database/UserViews";

// ─── Swarm Agents UI ──────────────────────────────────────────────────────────
//
// Layout:
//   Left  — chat messages (user + assistant + system handoff notices)
//   Right — Topics panel (agent registry moved to 🗄️ View Database → SessionCard)
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Write a blog post about our best-selling electronics",
  "Create a report on customer purchasing trends",
  "Analyze our top revenue-generating products",
  "Write about our most loyal customers and what they buy",
];

function ChatBubble({ msg }: { msg: SwarmChatMessage }) {
  // ── System pills ──────────────────────────────────────────────────────────
  if (msg.kind === "agent-running") {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full border border-gray-200 dark:border-zinc-700">
          {agentLabel(msg.agent)} agent is active
        </span>
      </div>
    );
  }

  if (msg.kind === "done") {
    return (
      <div className="flex justify-center">
        <span className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1 rounded-full">
          ✅ Done{msg.summary ? `: ${msg.summary}` : ""}
        </span>
      </div>
    );
  }

  // Skip other tool-call types silently
  if (msg.kind === "tool-call") return null;

  // ── User bubble ───────────────────────────────────────────────────────────
  if (msg.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed bg-orange-500 text-white">
          <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
        </div>
        <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center text-gray-700 dark:text-zinc-300 text-xs ml-2 mt-1 flex-shrink-0">
          U
        </div>
      </div>
    );
  }

  // ── Handoff summary bubble (from tool-call summary field) ─────────────────
  if (msg.kind === "handoff-summary") {
    return (
      <div className="flex justify-start">
        <div className="w-7 h-7 rounded-full bg-amber-400 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
          ↪
        </div>
        <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200">
          <p className="whitespace-pre-wrap text-xs italic">{msg.content}</p>
        </div>
      </div>
    );
  }

  // ── Final assistant response bubble ───────────────────────────────────────
  return (
    <div className="flex justify-start">
      <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
        🐝
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700">
        <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
      </div>
    </div>
  );
}

type InnerTab = "chat" | "user-state";

export default function SwarmAgents({ isActive = true }: { isActive?: boolean }) {
  const { sessionId: runId, userId, resetSession: resetRunId } = useSession("swarm");
  const [input, setInput] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [topics, setTopics] = useState<Record<string, TopicData>>({});
  const [innerTab, setInnerTab] = useState<InnerTab>("chat");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMsgCountRef = useRef(0);

  const { messages, isLoading, error, startRun, reset: resetSwarm } = useSwarmMessages();

  // Stream topics for the current run via SSE (only when this tab is active)
  const streamedTopics = useTopicsStream(runId, { enabled: isActive });
  useEffect(() => { setTopics(streamedTopics); }, [streamedTopics]);

  // Stream database for the User State tab (only when this tab is active)
  const { data: dbData } = useDatabaseStream({ enabled: isActive });

  // Autoscroll only when new messages arrive
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      prevMsgCountRef.current = messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const prompt = input.trim();
      if (!prompt || isLoading || !runId || !userId) return;

      setTopics({});
      setHasStarted(true);
      setInput("");
      prevMsgCountRef.current = 0;

      await startRun(prompt, runId, userId);
    },
    [input, isLoading, runId, userId, startRun],
  );

  const handleReset = useCallback(() => {
    setTopics({});
    setHasStarted(false);
    setInput("");
    prevMsgCountRef.current = 0;
    resetSwarm();
    resetRunId();
  }, [resetSwarm, resetRunId]);

  const topicEntries = Object.entries(topics) as [string, TopicData][];

  if (!runId) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-130px)]">
        <div className="text-gray-500 dark:text-zinc-400 text-sm">Initializing session…</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-130px)]">
      {/* Header */}
      <div className="bg-white dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 via-orange-500 to-pink-500 flex items-center justify-center text-white text-sm">
              🐝
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Swarm Agents</h2>
              <p className="text-xs text-gray-500 dark:text-zinc-400">
                User: <span className="font-mono">{userId ? userId.slice(0, 16) + "…" : "…"}</span>
                {" · "}
                Run: <span className="font-mono">{runId.slice(0, 16)}…</span>
              </p>
            </div>
          </div>
          {hasStarted && (
            <button
              onClick={handleReset}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-zinc-400 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z" clipRule="evenodd" />
              </svg>
              New Run
            </button>
          )}
        </div>

        {/* Inner tab bar */}
        <div className="max-w-5xl mx-auto flex gap-1 mt-3">
          <button
            onClick={() => setInnerTab("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              innerTab === "chat"
                ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setInnerTab("user-state")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              innerTab === "user-state"
                ? "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            🔑 User State
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-zinc-900 px-4 py-6">
        <div className="max-w-5xl mx-auto">

          {/* Chat tab */}
          {innerTab === "chat" && (
            <>
              {/* Empty state */}
              {!hasStarted && (
                <div className="text-center py-8">
                  {/* Swarm topology diagram */}
                  <div className="flex items-center justify-center gap-2 mb-6">
                    {/* Agents */}
                    {[
                      { emoji: "🔍", label: "Researcher", color: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300", size: "w-14 h-14 text-2xl" },
                      { emoji: "✍️", label: "Writer", color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300", size: "w-14 h-14 text-2xl" },
                      { emoji: "📝", label: "Editor", color: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300", size: "w-14 h-14 text-2xl" },
                    ].map((agent, i, arr) => (
                      <div key={agent.label} className="flex items-center gap-2">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`${agent.size} rounded-full ${agent.color} flex items-center justify-center shadow-md`}>
                            {agent.emoji}
                          </div>
                          <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">{agent.label}</span>
                        </div>
                        {i < arr.length - 1 && (
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Description */}
                  <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-lg mx-auto mb-2">
                    Autonomous agents hand off to each other directly — no central orchestrator. Each
                    agent decides what to do next and passes control via a{" "}
                    <span className="font-mono text-gray-700 dark:text-zinc-300">handoff</span> tool.
                    Follow-up messages resume from the last active agent automatically.
                  </p>

                  {/* Suggestion chips */}
                  <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto mt-4">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="text-xs px-3 py-1.5 rounded-full border border-orange-200 dark:border-orange-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Running / done state */}
              {hasStarted && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* ── Left: Chat ── */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                      🐝 Swarm
                    </h3>
                    <div className="flex flex-col gap-3">
                      {/* Static "researcher agent is active" pill — always shown once the run starts */}
                      <div className="flex justify-center">
                        <span className="text-xs text-gray-400 dark:text-zinc-500 bg-gray-100 dark:bg-zinc-800 px-3 py-1 rounded-full border border-gray-200 dark:border-zinc-700">
                          🔍 researcher agent is active
                        </span>
                      </div>

                      {messages.map((msg, i) => (
                        <ChatBubble key={i} msg={msg} />
                      ))}

                      {isLoading && messages.length === 0 && (
                        <div className="flex justify-start">
                          <div className="w-7 h-7 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
                            🐝
                          </div>
                          <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                            <div className="flex gap-1 items-center py-1">
                              <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                              <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                              <span className="w-2 h-2 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── Right: Topics ── */}
                  <div className="flex flex-col">
                    <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wide mb-2">
                      📄 Topics
                      {topicEntries.length > 0 && (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs normal-case font-medium">
                          {topicEntries.length}
                        </span>
                      )}
                    </h3>

                    <div className="flex flex-col gap-2">
                      {topicEntries.length === 0 && isLoading && (
                        <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-600 py-4">
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                          <span>Waiting for first topic…</span>
                        </div>
                      )}
                      <div className="space-y-2">
                        {topicEntries.map(([topicName, data]) => (
                          <TopicCard key={topicName} topicName={topicName} data={data} />
                        ))}
                      </div>
                      {topicEntries.length > 0 && (
                        <div className="mt-2 p-3 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                          <p className="text-xs text-gray-400 dark:text-zinc-600 font-mono">
                            SELECT * FROM agent_topics WHERE run_id = &apos;{runId.slice(0, 20)}…&apos;
                          </p>
                          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
                            {topicEntries.length} topic{topicEntries.length !== 1 ? "s" : ""} written · agent registry in 🗄️ View Database
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm">
                  <span className="font-semibold">Error:</span> {error}
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}

          {/* User State tab */}
          {innerTab === "user-state" && (
            <SingleUserView data={dbData} userId={userId} />
          )}
        </div>
      </div>

      {/* Input bar — only shown on chat tab */}
      {innerTab === "chat" && (
        <div className="bg-white dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 px-4 py-4">
          <div className="max-w-5xl mx-auto">
            <form onSubmit={handleSubmit} className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e as unknown as React.FormEvent);
                  }
                }}
                placeholder="Give the swarm a task… e.g. 'Write a blog post about our best-selling products'"
                rows={1}
                disabled={isLoading}
                className="flex-1 resize-none rounded-xl border border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50 max-h-32 overflow-y-auto"
                style={{ minHeight: "48px" }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex-shrink-0 w-11 h-11 rounded-xl bg-orange-500 text-white flex items-center justify-center hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isLoading ? (
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                  </svg>
                )}
              </button>
            </form>
            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-2 text-center">
              Swarm at /api/swarm · Topics in{" "}
              <span className="font-mono">agent_topics</span> · Agent registry in 🗄️ View Database
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
