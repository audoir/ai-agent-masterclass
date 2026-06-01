"use client";

import { TopicCard, type TopicData } from "./TopicCard";

export function TopicsPanel({
  topicEntries,
  isLoading,
  runId,
}: {
  topicEntries: [string, TopicData][];
  isLoading: boolean;
  runId: string;
}) {
  return (
    <div className="flex flex-col">
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

      {topicEntries.length > 0 && runId && (
        <div className="mt-3 p-3 rounded-lg bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700">
          <p className="text-xs text-gray-400 dark:text-zinc-600 font-mono">
            SELECT * FROM agent_topics
            <br />
            WHERE run_id = &apos;{runId.slice(0, 20)}…&apos;
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-600 mt-1">
            {topicEntries.length} topic{topicEntries.length !== 1 ? "s" : ""} written · visible in 🗄️ View Database
          </p>
        </div>
      )}
    </div>
  );
}
