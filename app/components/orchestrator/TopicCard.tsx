"use client";

import { useState } from "react";
import { AGENT_COLORS, DEFAULT_COLORS, AGENT_EMOJIS } from "./constants";

export interface TopicData {
  content: string;
  agentName: string;
  createdAt: string;
}

export function TopicCard({
  topicName,
  data,
}: {
  topicName: string;
  data: TopicData;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = AGENT_COLORS[data.agentName] ?? DEFAULT_COLORS;
  const emoji = AGENT_EMOJIS[data.agentName] ?? "📡";

  return (
    <div className={`rounded-xl border ${colors.border} transition-all duration-300`}>
      <div className={`flex items-center gap-3 px-4 py-3 rounded-t-xl ${colors.bg}`}>
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 ${colors.badge}`}
        >
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-sm font-semibold ${colors.header}`}>
              topic:{topicName}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors.badge}`}>
              ✓ {data.agentName.replace("_", " ")}
            </span>
          </div>
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-0.5 font-mono">
            {data.content.length.toLocaleString()} chars · {data.createdAt}
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex-shrink-0 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
        >
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
      {expanded && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-200 dark:border-zinc-700">
          <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-100 dark:bg-zinc-800 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto font-mono leading-relaxed">
            {data.content}
          </pre>
        </div>
      )}
    </div>
  );
}
