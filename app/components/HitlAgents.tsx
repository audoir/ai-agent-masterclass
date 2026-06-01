"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompletion } from "@ai-sdk/react";
import { useSession } from "@/app/components/chat/useSession";
import type { ChatMessage } from "@/app/components/chat/types";
import { ChatPanel } from "./orchestrator/ChatPanel";
import { TopicsPanel } from "./orchestrator/TopicsPanel";
import { InputBar } from "./orchestrator/InputBar";
import type { TopicData } from "./orchestrator/TopicCard";
import { useTopicsStream } from "@/app/hooks/useTopicsStream";
import { useDatabaseStream } from "@/app/hooks/useDatabaseStream";
import { SingleUserView } from "./database/UserViews";

// ─── HITL (Human-in-the-Loop) Database Mutator UI ────────────────────────────
//
// Drives the Database Mutator Orchestrator at /api/orchestrator/mutator.
//
// The pipeline:
//   - INSERT: executes immediately, topics show mutation-result_v0 with STATUS: success.
//   - UPDATE/DELETE: first pass returns STATUS: fail and asks for confirmation.
//     The orchestrator calls request_human_approval, which stops and presents
//     the question to the user. The user replies in the chat, and the second
//     pass executes (or cancels) based on the reply.
//
// Topics streamed live via SSE from GET /api/orchestrator/mutator?runId=...
// ─────────────────────────────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Add a new product: Bluetooth Speaker, category Electronics, price $79.99",
  "Update the price of the USB-C Hub to $27.99",
  "Delete all sales records older than 2026-02-01",
  "Delete the product 'Gaming Chair' from inventory",
];

type InnerTab = "chat" | "user-state";

export default function HitlAgents({ isActive = true }: { isActive?: boolean }) {
  const { sessionId: runId, userId, resetSession: resetRunId } = useSession("hitl");
  const [input, setInput] = useState("");
  // chatHistory holds the optimistic messages shown during streaming.
  // After each run completes, it is replaced with the persisted DB messages.
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [topics, setTopics] = useState<Record<string, TopicData>>({});
  const [innerTab, setInnerTab] = useState<InnerTab>("chat");

  // Stream topics for the current run via SSE (only when this tab is active)
  const streamedTopics = useTopicsStream(runId, { enabled: isActive });

  // Merge streamed topics into local state
  useEffect(() => {
    setTopics(streamedTopics);
  }, [streamedTopics]);

  // Stream database for the User State tab (only when this tab is active)
  const { data: dbData } = useDatabaseStream({ enabled: isActive });

  // Fetch persisted user+assistant messages for the current session from the DB.
  // Called in onFinish so we replace the optimistic chatHistory with the real data.
  const fetchPersistedMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/orchestrator/messages?sessionId=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = (await res.json()) as { messages: { role: "user" | "assistant"; content: string }[] };
      if (data.messages && data.messages.length > 0) {
        setChatHistory(data.messages.map((m) => ({ role: m.role, content: m.content })));
      }
    } catch {
      // silently ignore — chatHistory already has the optimistic messages
    }
  }, []);

  const { completion, complete, isLoading, error } = useCompletion({
    api: "/api/orchestrator/mutator",
    onFinish: () => {
      if (runId) fetchPersistedMessages(runId);
    },
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const userMessage = input.trim();
      if (!userMessage || isLoading || !runId) return;

      setChatHistory((prev) => [...prev, { role: "user", content: userMessage }]);
      setInput("");

      await complete(userMessage, { body: { runId, userId } });
    },
    [input, isLoading, complete, runId, userId],
  );

  const handleReset = useCallback(() => {
    setChatHistory([]);
    setTopics({});
    setInput("");
    resetRunId();
  }, [resetRunId]);

  const hasStarted = chatHistory.length > 0 || isLoading;
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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 flex items-center justify-center text-white text-sm">
              🧑‍💻
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                HITL — Database Mutator
              </h2>
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-3.5 h-3.5"
              >
                <path
                  fillRule="evenodd"
                  d="M15.312 11.424a5.5 5.5 0 01-9.201 2.466l-.312-.311h2.433a.75.75 0 000-1.5H3.989a.75.75 0 00-.75.75v4.242a.75.75 0 001.5 0v-2.43l.31.31a7 7 0 0011.712-3.138.75.75 0 00-1.449-.39zm1.23-3.723a.75.75 0 00.219-.53V2.929a.75.75 0 00-1.5 0V5.36l-.31-.31A7 7 0 003.239 8.188a.75.75 0 101.448.389A5.5 5.5 0 0113.89 6.11l.311.31h-2.432a.75.75 0 000 1.5h4.243a.75.75 0 00.53-.219z"
                  clipRule="evenodd"
                />
              </svg>
              New Run
            </button>
          )}
        </div>

        {/* Inner tab bar */}
        <div className="max-w-4xl mx-auto flex gap-1 mt-3">
          <button
            onClick={() => setInnerTab("chat")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              innerTab === "chat"
                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setInnerTab("user-state")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              innerTab === "user-state"
                ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            🔑 User State
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-zinc-900 px-4 py-6">
        <div className="max-w-4xl mx-auto">

          {/* Chat tab */}
          {innerTab === "chat" && (
            <>
              {!hasStarted && (
                <div className="flex flex-col items-center justify-center py-16 gap-6">
                  <div className="text-center">
                    <div className="text-4xl mb-3">🧑‍💻</div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                      Human-in-the-Loop Database Mutator
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-zinc-400 max-w-md">
                      Request database changes. INSERT operations execute immediately.
                      UPDATE and DELETE operations require your confirmation before executing.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 w-full max-w-md">
                    {SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        onClick={() => setInput(s)}
                        className="text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-sm text-gray-700 dark:text-zinc-300 hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-900/10 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {hasStarted && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <ChatPanel
                    chatHistory={chatHistory}
                    completion={completion}
                    isLoading={isLoading}
                  />
                  <TopicsPanel
                    topicEntries={topicEntries}
                    isLoading={isLoading}
                    runId={runId}
                  />
                </div>
              )}

              {error && (
                <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-red-700 dark:text-red-400 text-sm">
                  <span className="font-semibold">Error:</span> {error.message || String(error)}
                </div>
              )}
            </>
          )}

          {/* User State tab */}
          {innerTab === "user-state" && (
            <SingleUserView data={dbData} userId={userId} />
          )}

        </div>
      </div>

      {innerTab === "chat" && (
        <InputBar
          input={input}
          isLoading={isLoading}
          onChange={setInput}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}
