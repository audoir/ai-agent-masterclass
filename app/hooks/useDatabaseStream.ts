"use client";

import { useEffect, useState } from "react";
import type { DatabaseData } from "@/lib/types";

/**
 * Opens a persistent SSE connection to /api/database and returns
 * the latest database snapshot, a loading flag, and any error message.
 * Pass `enabled=false` to pause the connection (e.g. when the tab is hidden).
 */
export function useDatabaseStream({ enabled = true }: { enabled?: boolean } = {}) {
  const [data, setData] = useState<DatabaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    let cancelled = false;

    fetch("/api/database")
      .then(async (res) => {
        if (!res.body) {
          setError("No response body");
          setLoading(false);
          return;
        }

        reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          // SSE events are separated by double newlines
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice("data: ".length);
            try {
              const parsed = JSON.parse(raw);
              if (parsed.error) {
                setError(parsed.error);
              } else {
                setData(parsed as DatabaseData);
                setError(null);
              }
              setLoading(false);
            } catch {
              // ignore malformed events
            }
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      reader?.cancel();
    };
  }, [enabled]);

  return { data, loading, error };
}
