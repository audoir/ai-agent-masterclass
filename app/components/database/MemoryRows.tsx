"use client";

import { useState } from "react";
import type { EpisodicMemoryItem, SemanticMemoryItem } from "@/lib/types";

// ─── EpisodicMemoryRow ────────────────────────────────────────────────────────

export function EpisodicMemoryRow({ memory, index }: { memory: EpisodicMemoryItem; index?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors bg-amber-50/50 dark:bg-amber-900/10"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
          🧠{index !== undefined ? ` #${index + 1}` : ""}
        </span>
        <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono ml-auto flex-shrink-0">
          {memory.content.length.toLocaleString()} chars · {memory.created_at}
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
        <div className="px-3 pb-3 border-t border-amber-200 dark:border-amber-800">
          <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-900 rounded-lg p-2 mt-2 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
            {memory.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── SemanticMemoryRow ────────────────────────────────────────────────────────

export function SemanticMemoryRow({
  memory,
  isLatest,
}: {
  memory: SemanticMemoryItem;
  isLatest: boolean;
}) {
  const [expanded, setExpanded] = useState(isLatest);

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-800 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-900/10 transition-colors bg-violet-50/50 dark:bg-violet-900/10"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300">
          💡
        </span>
        {isLatest && (
          <span className="text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
            latest
          </span>
        )}
        <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono ml-auto flex-shrink-0">
          {memory.content.length.toLocaleString()} chars · {memory.created_at}
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
        <div className="px-3 pb-3 border-t border-violet-200 dark:border-violet-800">
          <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-900 rounded-lg p-2 mt-2 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto font-mono leading-relaxed">
            {memory.content}
          </pre>
        </div>
      )}
    </div>
  );
}

// ─── SystemPromptPanel ────────────────────────────────────────────────────────

export function SystemPromptPanel({ systemPrompt }: { systemPrompt: string }) {
  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/20">
        <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
          🤖 Orchestrator System Prompt
        </span>
        <span className="text-xs text-gray-400 dark:text-zinc-600 font-mono ml-auto">
          {systemPrompt.length.toLocaleString()} chars
        </span>
      </div>
      <div className="px-3 pb-3 pt-2 border-t border-indigo-200 dark:border-indigo-800">
        <pre className="text-xs text-gray-700 dark:text-zinc-300 bg-gray-50 dark:bg-zinc-900 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto font-mono leading-relaxed">
          {systemPrompt}
        </pre>
      </div>
    </div>
  );
}
