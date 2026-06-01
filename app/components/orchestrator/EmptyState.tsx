"use client";

import { SUGGESTIONS } from "./constants";

export function EmptyState({
  onSelectSuggestion,
}: {
  onSelectSuggestion: (s: string) => void;
}) {
  return (
    <div className="text-center py-8">
      {/* Pipeline diagram */}
      <div className="flex items-center justify-center gap-1 mb-6">
        {/* Orchestrator */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-full bg-indigo-600 flex items-center justify-center text-2xl shadow-md">
            🤖
          </div>
          <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Orchestrator</span>
          <span className="text-xs text-gray-400 dark:text-zinc-500 font-mono">passes runId only</span>
        </div>

        {/* Arrows + sub-agents */}
        <div className="flex flex-col gap-3 mx-3">
          {[
            {
              emoji: "🔍",
              label: "Researcher",
              color: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
            },
            {
              emoji: "✍️",
              label: "Writer",
              color: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
            },
            {
              emoji: "📝",
              label: "Editor",
              color: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
            },
          ].map((agent) => (
            <div key={agent.label} className="flex items-center gap-1">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <div
                className={`w-8 h-8 rounded-full ${agent.color} flex items-center justify-center text-sm shadow`}
              >
                {agent.emoji}
              </div>
              <span className="text-xs font-medium text-gray-600 dark:text-zinc-400">
                {agent.label}
              </span>
            </div>
          ))}
        </div>

        {/* Topic names */}
        <div className="flex flex-col items-center gap-1 ml-1">
          <div className="text-xs font-mono text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded px-2 py-1">
            research_v0
          </div>
          <div className="text-xs font-mono text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded px-2 py-1">
            draft_v0
          </div>
          <div className="text-xs font-mono text-gray-500 dark:text-zinc-400 bg-gray-100 dark:bg-zinc-800 rounded px-2 py-1">
            final_v0
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-500 dark:text-zinc-500 max-w-lg mx-auto mb-2">
        The Orchestrator delegates to 3 specialist sub-agents via MCP. Each agent reads its input
        from and writes its output to a named{" "}
        <span className="font-mono text-gray-700 dark:text-zinc-300">topic</span> stored in the
        session — keeping the Orchestrator&apos;s context small.
      </p>

      {/* Suggestion chips */}
      <div className="flex flex-wrap justify-center gap-2 mt-4">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSelectSuggestion(s)}
            className="text-xs px-3 py-1.5 rounded-full border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
