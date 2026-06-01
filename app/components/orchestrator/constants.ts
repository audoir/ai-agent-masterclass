"use client";

// ─── OrchestratorAgents shared constants ─────────────────────────────────────

export const AGENT_COLORS: Record<
  string,
  { border: string; bg: string; badge: string; header: string }
> = {
  researcher_agent: {
    border: "border-blue-200 dark:border-blue-800",
    bg: "bg-blue-50 dark:bg-blue-900/20",
    badge: "bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300",
    header: "text-blue-700 dark:text-blue-300",
  },
  writer_agent: {
    border: "border-emerald-200 dark:border-emerald-800",
    bg: "bg-emerald-50 dark:bg-emerald-900/20",
    badge: "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300",
    header: "text-emerald-700 dark:text-emerald-300",
  },
  editor_agent: {
    border: "border-purple-200 dark:border-purple-800",
    bg: "bg-purple-50 dark:bg-purple-900/20",
    badge: "bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300",
    header: "text-purple-700 dark:text-purple-300",
  },
};

export const DEFAULT_COLORS = {
  border: "border-gray-200 dark:border-zinc-700",
  bg: "bg-gray-50 dark:bg-zinc-800/50",
  badge: "bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-zinc-300",
  header: "text-gray-700 dark:text-zinc-300",
};

export const AGENT_EMOJIS: Record<string, string> = {
  researcher_agent: "🔍",
  writer_agent: "✍️",
  editor_agent: "📝",
};

export const SUGGESTIONS = [
  "Write a blog post about our best-selling electronics",
  "Create a report on customer purchasing trends",
  "Analyze our top revenue-generating products",
  "Write about our most loyal customers and what they buy",
];
