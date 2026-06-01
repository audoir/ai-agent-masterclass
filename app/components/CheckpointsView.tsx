"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompletion } from "@ai-sdk/react";
import { useSession } from "@/app/components/chat/useSession";
import type { ChatMessage } from "@/app/components/chat/types";
import { EmptyState } from "./orchestrator/EmptyState";
import { ChatPanel } from "./orchestrator/ChatPanel";
import { TopicsPanel } from "./orchestrator/TopicsPanel";
import { InputBar } from "./orchestrator/InputBar";
import { MessageBubble } from "./database/MessageBubble";
import { useMessagesStream } from "@/app/hooks/useMessagesStream";
import { useTopicsStream } from "@/app/hooks/useTopicsStream";
import type { TopicData } from "./orchestrator/TopicCard";
import { useDatabaseStream } from "@/app/hooks/useDatabaseStream";
import { SingleUserView } from "./database/UserViews";

// ─── CheckpointsView ──────────────────────────────────────────────────────────
//
// Same layout as OrchestratorAgents but the right panel shows the raw
// chat_messages rows from the database (streamed live via SSE) instead of
// agent topics. This makes every checkpoint visible — user messages, tool
// calls, tool results, and assistant replies — exactly as stored in the DB.
// ─────────────────────────────────────────────────────────────────────────────

type InnerTab = "chat" | "user-state";

export default function CheckpointsView({ isActive = true }: { isActive?: boolean }) {
  const { sessionId: runId, userId, resetSession: resetRunId } = useSession("checkpoints");
  const [input, setInput] = useState("");
  // chatHistory holds the optimistic messages shown during streaming.
  // After each run completes, it is replaced with the persisted DB messages.
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  // Track which checkpoint is expanded for rerun (message id → prompt text)
  const [expandedCheckpoint, setExpandedCheckpoint] = useState<string | null>(null);
  const [restorePrompt, setRestorePrompt] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  // Right-pane tab: "messages" or "topics"
  const [rightTab, setRightTab] = useState<"messages" | "topics">("messages");
  // Inner tab: "chat" or "user-state"
  const [innerTab, setInnerTab] = useState<InnerTab>("chat");
  // Stream raw DB messages and checkpoint ids for the current run via SSE (only when active)
  const { messages: dbMessages, checkpointMessageIds } = useMessagesStream(runId ?? null, { enabled: isActive });
  // Stream topics for the current run via SSE (only when active)
  const [topics, setTopics] = useState<Record<string, TopicData>>({});
  const streamedTopics = useTopicsStream(runId, { enabled: isActive });
  useEffect(() => { setTopics(streamedTopics); }, [streamedTopics]);
  const topicEntries = Object.entries(topics) as [string, TopicData][];

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

  const { completion, complete, stop, isLoading, error } = useCompletion({
    api: "/api/orchestrator/checkpoints/start",
    onFinish: () => {
      if (runId) fetchPersistedMessages(runId);
    },
  });

  const {
    completion: restoreCompletion,
    complete: completeRestore,
    stop: stopRestore,
    isLoading: isRestoreLoading,
  } = useCompletion({
    api: "/api/orchestrator/checkpoints/restore",
    onFinish: () => {
      setIsRestoring(false);
      if (runId) fetchPersistedMessages(runId);
    },
  });

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const userTopic = input.trim();
      if (!userTopic || isLoading || !runId) return;

      setChatHistory((prev) => [...prev, { role: "user", content: userTopic }]);
      setInput("");

      await complete(userTopic, { body: { runId, userId } });
    },
    [input, isLoading, complete, runId, userId],
  );

  const handleReset = useCallback(() => {
    setChatHistory([]);
    setInput("");
    resetRunId();
  }, [resetRunId]);

  const handleRestore = useCallback(
    async (messageId: string, prompt: string | undefined) => {
      if (!runId || !userId) return;
      setIsRestoring(true);
      setExpandedCheckpoint(null);
      setRestorePrompt("");

      // Optimistically show a user message in the left chat panel if a prompt
      // was provided, so the left pane updates immediately.
      if (prompt) {
        setChatHistory((prev) => [...prev, { role: "user", content: prompt }]);
      }

      // Use the second useCompletion instance bound to /api/orchestrator-restore.
      // completeRestore sends the body as { prompt, ...body } where prompt is
      // the first arg. We pass a placeholder prompt and put the real params in body.
      await completeRestore("restore", {
        body: { sessionId: runId, messageId, userId, ...(prompt ? { prompt } : {}) },
      });
    },
    [runId, userId, completeRestore],
  );

  // Show restore completion in the left panel while streaming
  const activeCompletion = isRestoreLoading ? restoreCompletion : completion;
  const activeIsLoading = isLoading || isRestoreLoading;

  const hasStarted = chatHistory.length > 0 || activeIsLoading;

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
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 via-fuchsia-500 to-pink-500 flex items-center justify-center text-white text-sm">
              🔖
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Checkpoints
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
                ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                : "text-gray-500 dark:text-zinc-400 hover:bg-gray-50 dark:hover:bg-zinc-700 hover:text-gray-700 dark:hover:text-zinc-200"
            }`}
          >
            💬 Chat
          </button>
          <button
            onClick={() => setInnerTab("user-state")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              innerTab === "user-state"
                ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
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
              {!hasStarted && <EmptyState onSelectSuggestion={setInput} />}

              {hasStarted && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Left: orchestrator chat (streaming) */}
                  <ChatPanel
                    chatHistory={chatHistory}
                    completion={activeCompletion}
                    isLoading={activeIsLoading}
                  />

                  {/* Right: tabbed panel */}
                  <div>
                    {/* Tab bar */}
                    <div className="flex gap-1 mb-3">
                      <button
                        type="button"
                        onClick={() => setRightTab("messages")}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          rightTab === "messages"
                            ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                            : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                        }`}
                      >
                        🔖 Messages ({dbMessages.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightTab("topics")}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          rightTab === "topics"
                            ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                            : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                        }`}
                      >
                        📡 Topics ({topicEntries.length})
                      </button>
                    </div>

                    {/* Topics tab */}
                    {rightTab === "topics" && (
                      <TopicsPanel
                        topicEntries={topicEntries}
                        isLoading={activeIsLoading}
                        runId={runId}
                      />
                    )}

                    {/* Rerun Modal */}
                    {expandedCheckpoint !== null && (() => {
                      const msg = dbMessages.find((m) => m.id === expandedCheckpoint);
                      if (!msg) return null;
                      const promptRequired = msg.role === "user";
                      return (
                        <div
                          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                          onClick={(e) => {
                            if (e.target === e.currentTarget) {
                              setExpandedCheckpoint(null);
                              setRestorePrompt("");
                            }
                          }}
                        >
                          <div className="w-full max-w-md mx-4 rounded-xl border border-violet-200 dark:border-violet-800 bg-white dark:bg-zinc-900 shadow-2xl p-5">
                            <div className="flex items-center justify-between mb-4">
                              <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300">
                                🔖 Rerun from checkpoint
                              </h3>
                              <button
                                type="button"
                                onClick={() => {
                                  setExpandedCheckpoint(null);
                                  setRestorePrompt("");
                                }}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-zinc-200 transition-colors text-lg leading-none"
                              >
                                ✕
                              </button>
                            </div>
                            <p className="text-xs text-gray-500 dark:text-zinc-400 mb-1 font-mono">
                              Message #{msg.id} · <span className="capitalize">{msg.role}</span>
                            </p>
                            <p className="text-xs text-violet-600 dark:text-violet-400 mb-3 font-medium">
                              {promptRequired
                                ? "New prompt (required for user message):"
                                : "New prompt (optional — leave blank to rerun as-is):"}
                            </p>
                            <div className="flex flex-col gap-3">
                              <textarea
                                value={restorePrompt}
                                onChange={(e) => setRestorePrompt(e.target.value)}
                                placeholder={promptRequired ? "Enter a new prompt…" : "Leave blank to rerun from this point…"}
                                rows={3}
                                disabled={isRestoring}
                                className="w-full resize-none rounded-lg border border-violet-200 dark:border-violet-700 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-zinc-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 disabled:opacity-50"
                              />
                              <div className="flex gap-2 justify-end">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setExpandedCheckpoint(null);
                                    setRestorePrompt("");
                                  }}
                                  className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-zinc-300 border border-gray-200 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={isRestoring || isLoading || (promptRequired && !restorePrompt.trim())}
                                  onClick={() => handleRestore(msg.id, restorePrompt.trim() || undefined)}
                                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                >
                                  {isRestoring ? (
                                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" />
                                  ) : (
                                    "▶ Run"
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                            {/* Messages tab */}
                    {rightTab === "messages" && dbMessages.length === 0 && isLoading && (
                      <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-zinc-600 py-4">
                        <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                        <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                        <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        <span>Waiting for first message…</span>
                      </div>
                    )}
                    {rightTab === "messages" && (
                      <>
                        <div className="space-y-2">
                          {dbMessages.map((msg) => {
                            const hasCheckpoint = checkpointMessageIds.has(msg.id);
                            const isExpanded = expandedCheckpoint === msg.id;
                            const promptRequired = msg.role === "user";
                            return (
                              <div
                                key={msg.id}
                                className={`flex flex-col gap-0.5 ${
                                  msg.role === "user" ? "items-end" : "items-start"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 px-1">
                                  <span className="text-xs text-gray-400 dark:text-zinc-600 capitalize">
                                    {msg.role}
                                  </span>
                                  <span className="text-xs text-gray-300 dark:text-zinc-700 font-mono">
                                    #{msg.id}
                                  </span>
                                  {hasCheckpoint && (
                                    <button
                                      type="button"
                                      disabled={isLoading || isRestoring}
                                      onClick={() => {
                                        if (isExpanded) {
                                          setExpandedCheckpoint(null);
                                          setRestorePrompt("");
                                        } else {
                                          setExpandedCheckpoint(msg.id);
                                          setRestorePrompt("");
                                        }
                                      }}
                                      className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                      🔖 Rerun from here
                                    </button>
                                  )}
                                </div>
                                <MessageBubble msg={msg} />
                              </div>
                            );
                          })}
                        </div>
                        {dbMessages.length > 0 && (
                          <div className="mt-3 p-3 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
                            <p className="text-xs text-gray-400 dark:text-zinc-600 font-mono">
                              chat_sessions.messages (JSON)
                              <br />
                              session_id = &apos;{runId.slice(0, 20)}…&apos;
                            </p>
                            <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
                              {dbMessages.length} message{dbMessages.length !== 1 ? "s" : ""} · checkpoints in{" "}
                              <span className="font-mono">session_checkpoints</span>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
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
          isLoading={activeIsLoading}
          onChange={setInput}
          onSubmit={handleSubmit}
          onStop={activeIsLoading ? (isRestoreLoading ? () => { stopRestore(); setIsRestoring(false); } : stop) : undefined}
        />
      )}
    </div>
  );
}
