"use client";

import { useState } from "react";
import type { ChatSessionItem, AgentRegistryEntry, TopicItem } from "@/lib/types";
import { TopicRow } from "./TopicRow";
import { MessageBubble } from "./MessageBubble";
import { EpisodicMemoryRow, SystemPromptPanel } from "./MemoryRows";

// ─── AgentRegistryCard ────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, { border: string; bg: string; badge: string }> = {
  researcher: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
  },
  writer: {
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
  },
  editor: {
    border: "border-purple-200 dark:border-purple-800",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
  },
};

const AGENT_EMOJIS: Record<string, string> = {
  researcher: "🔍",
  writer: "✍️",
  editor: "📝",
};

const STATUS_COLORS: Record<string, string> = {
  running: "bg-yellow-400 animate-pulse",
  done: "bg-emerald-400",
  error: "bg-red-400",
};

function AgentRegistryCard({
  agentName,
  entry,
}: {
  agentName: string;
  entry: AgentRegistryEntry;
}) {
  const [expandedRun, setExpandedRun] = useState<number | null>(null);
  const colors = AGENT_COLORS[agentName] ?? {
    border: "border-gray-200 dark:border-zinc-700",
    bg: "bg-gray-50 dark:bg-zinc-800/50",
    badge: "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300",
  };
  const emoji = AGENT_EMOJIS[agentName] ?? "🤖";
  const statusDot = STATUS_COLORS[entry.status] ?? "bg-gray-400";

  return (
    <div className={`rounded-lg border ${colors.border} overflow-hidden`}>
      {/* Agent header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${colors.bg}`}>
        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${colors.badge}`}>
          {emoji} {agentName}
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
          <span className="text-xs text-gray-500 dark:text-zinc-400">{entry.status}</span>
        </span>
        <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono ml-auto flex-shrink-0">
          {entry.runs.length} run{entry.runs.length !== 1 ? "s" : ""}
        </span>
      </div>
      {/* Error message */}
      {entry.error_message && (
        <div className="px-3 py-1 text-xs text-red-500 border-t border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10">
          {entry.error_message}
        </div>
      )}
      {/* Individual runs */}
      {entry.runs.length > 0 && (
        <div className={`border-t ${colors.border} divide-y divide-gray-100 dark:divide-zinc-800`}>
          {entry.runs.map((run, i) => (
            <div key={i}>
              <div
                className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-800/50 transition-colors"
                onClick={() => setExpandedRun(expandedRun === i ? null : i)}
              >
                <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono">
                  run #{i + 1}
                </span>
                <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono ml-auto">
                  {run.started_at}
                  {run.finished_at && ` → ${run.finished_at}`}
                </span>
                {run.system_prompt && (
                  <svg
                    className={`w-3 h-3 text-gray-400 flex-shrink-0 transition-transform ${expandedRun === i ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                )}
              </div>
              {expandedRun === i && run.system_prompt && (
                <div className="px-3 pb-3 pt-1">
                  <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1">System Prompt</p>
                  <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-900 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">
                    {run.system_prompt}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SessionCard ──────────────────────────────────────────────────────────────

type InnerTab = "messages" | "topics" | "memory" | "prompt" | "registry";

export function SessionCard({
  session,
}: {
  session: ChatSessionItem;
}) {
  const [expanded, setExpanded] = useState(false);
  const messages = session.messages ?? [];
  const topicsMap: Record<string, TopicItem> = session.topics ?? {};
  const topicEntries = Object.entries(topicsMap);
  const episodicMemories = session.episodic_memories ?? [];
  const agentRegistry: Record<string, AgentRegistryEntry> = session.agent_registry ?? {};
  const agentRegistryEntries = Object.entries(agentRegistry);
  const systemPrompt = session.system_prompt ?? null;

  const defaultTab: InnerTab =
    messages.length > 0 ? "messages"
    : topicEntries.length > 0 ? "topics"
    : agentRegistryEntries.length > 0 ? "registry"
    : "memory";
  const [activeTab, setActiveTab] = useState<InnerTab>(defaultTab);

  const hasContent =
    messages.length > 0 ||
    topicEntries.length > 0 ||
    episodicMemories.length > 0 ||
    agentRegistryEntries.length > 0 ||
    !!systemPrompt;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors bg-white dark:bg-zinc-800"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="w-7 h-7 rounded-full bg-gray-100 dark:bg-zinc-700 flex items-center justify-center text-xs flex-shrink-0">
          💬
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-gray-700 dark:text-zinc-300 truncate">
            {session.id}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5">
            {session.created_at}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {messages.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              {messages.length} msg{messages.length !== 1 ? "s" : ""}
            </span>
          )}
          {topicEntries.length > 0 && (
            <span className="text-xs text-gray-500 dark:text-zinc-400">
              {topicEntries.length} topic{topicEntries.length !== 1 ? "s" : ""}
            </span>
          )}
          {episodicMemories.length > 0 && (
            <span className="text-xs text-amber-500 dark:text-amber-400">
              🧠 {episodicMemories.length}
            </span>
          )}
          {systemPrompt && (
            <span className="text-xs text-indigo-500 dark:text-indigo-400">
              🤖 prompt
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900">
          {hasContent && (
            <div className="flex gap-1 px-4 pt-3 flex-wrap">
              {systemPrompt && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab("prompt"); }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTab === "prompt"
                      ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                  }`}
                >
                  🤖 System Prompt
                </button>
              )}
              {messages.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab("messages"); }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTab === "messages"
                      ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                  }`}
                >
                  💬 Messages ({messages.length})
                </button>
              )}
              {topicEntries.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab("topics"); }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTab === "topics"
                      ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                  }`}
                >
                  📡 Agent Topics ({topicEntries.length})
                </button>
              )}
              {agentRegistryEntries.length > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); setActiveTab("registry"); }}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeTab === "registry"
                      ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                      : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                  }`}
                >
                  🤖 Agent Registry ({agentRegistryEntries.length})
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setActiveTab("memory"); }}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  activeTab === "memory"
                    ? "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white shadow-sm border border-gray-200 dark:border-zinc-700"
                    : "text-gray-500 dark:text-zinc-400 hover:text-gray-700 dark:hover:text-zinc-200"
                }`}
              >
                🧠 Memory
                {episodicMemories.length > 0 && ` (${episodicMemories.length})`}
              </button>
            </div>
          )}

          <div className="p-4">
            {/* Topics */}
            {activeTab === "topics" && (
              <div className="space-y-2">
                {topicEntries.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-4">
                    No agent topics for this session.
                  </p>
                ) : (
                  topicEntries.map(([topicName, topic]) => (
                    <TopicRow key={topicName} topicName={topicName} topic={topic} />
                  ))
                )}
              </div>
            )}

            {/* Messages */}
            {activeTab === "messages" && (
              <div className="space-y-2">
                {messages.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-4">
                    No messages for this session.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col gap-0.5 ${
                        m.role === "user" ? "items-end" : "items-start"
                      }`}
                    >
                      <span className="text-xs text-gray-400 dark:text-zinc-600 px-1 capitalize">
                        {m.role}
                      </span>
                      <MessageBubble msg={m} />
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Memory */}
            {activeTab === "memory" && (
              <div className="space-y-2">
                {episodicMemories.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-4">
                    No episodic memory for this session yet.
                    <br />
                    <span className="text-gray-300 dark:text-zinc-700">
                      Memory is written after the pipeline run completes.
                    </span>
                  </p>
                ) : (
                  <div>
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">
                      🧠 Episodic Memory (this session)
                    </p>
                    <div className="space-y-1.5">
                      {episodicMemories.map((mem, i) => (
                        <EpisodicMemoryRow key={i} memory={mem} index={i} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Agent Registry */}
            {activeTab === "registry" && (
              <div className="space-y-2">
                {agentRegistryEntries.length === 0 ? (
                  <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-4">
                    No agent registry entries for this session.
                  </p>
                ) : (
                  agentRegistryEntries.map(([agentName, entry]) => (
                    <AgentRegistryCard key={agentName} agentName={agentName} entry={entry} />
                  ))
                )}
              </div>
            )}

            {/* System Prompt */}
            {activeTab === "prompt" && (
              <div>
                {systemPrompt ? (
                  <SystemPromptPanel systemPrompt={systemPrompt} />
                ) : (
                  <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-4">
                    No system prompt recorded for this session.
                  </p>
                )}
              </div>
            )}

            {!hasContent && (
              <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-4">
                No content for this session yet.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
