"use client";

import { useState } from "react";
import type { TopicItem } from "@/lib/types";
import { AGENT_COLORS } from "./constants";

// TopicRow renders a single entry from the chat_sessions.topics JSON object.
// `topicName` is the key; `topic` is the { content, agent_name, created_at } value.
export function TopicRow({ topicName, topic }: { topicName: string; topic: TopicItem }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass =
    AGENT_COLORS[topic.agent_name] ??
    "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300";

  return (
    <div className="rounded-lg border border-gray-100 dark:border-zinc-700 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${colorClass}`}
        >
          {topic.agent_name}
        </span>
        <span className="text-xs font-mono font-semibold text-gray-700 dark:text-zinc-300">
          topic:{topicName}
        </span>
        <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono ml-auto flex-shrink-0">
          {topic.content.length.toLocaleString()} chars
        </span>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${
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
      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-zinc-700">
          <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-900 rounded-lg p-2 mt-2 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
            {topic.content}
          </pre>
        </div>
      )}
    </div>
  );
}
