"use client";

import { useEffect, useRef, useState } from "react";
import type { TopicData } from "@/app/components/orchestrator/TopicCard";

// ─── useTopicsStream ──────────────────────────────────────────────────────────
//
// Opens a persistent SSE connection to /api/topics for the given runId and
// returns the latest topics map. Reconnects automatically whenever runId
// changes, and cancels the stream on unmount or when enabled=false.
//
// The SSE payload is:
//   { runId, topics: Record<string, { content, agent_name, created_at }> }
// ─────────────────────────────────────────────────────────────────────────────

export function useTopicsStream(
  runId: string | null | undefined,
  { enabled = true }: { enabled?: boolean } = {},
): Record<string, TopicData> {
  const [topics, setTopics] = useState<Record<string, TopicData>>({});
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    if (!runId || !enabled) return;

    setTopics({});
    let cancelled = false;

    fetch(`/api/topics?runId=${encodeURIComponent(runId)}`)
      .then(async (res) => {
        if (!res.body) return;

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice("data: ".length);
            try {
              const parsed = JSON.parse(raw) as {
                topics: Record<string, TopicData>;
              };
              if (parsed.topics && typeof parsed.topics === "object") {
                setTopics(parsed.topics);
              }
            } catch {
              // ignore malformed events
            }
          }
        }
      })
      .catch(() => {
        /* non-fatal */
      });

    return () => {
      cancelled = true;
      readerRef.current?.cancel();
      readerRef.current = null;
    };
  }, [runId, enabled]);

  return topics;
}
