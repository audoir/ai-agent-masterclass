"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentRegistryItem, AgentStatus } from "@/lib/types";

export interface RegistrySnapshot {
  runId: string;
  status: AgentStatus | null;
  agents: AgentRegistryItem[];
}

/**
 * Opens a persistent SSE connection to /api/agent-registry for the given
 * runId and returns the latest registry snapshot. Reconnects automatically
 * whenever runId changes, and cancels the stream on unmount.
 */
export function useRegistryStream(runId: string | null): RegistrySnapshot | null {
  const [snapshot, setSnapshot] = useState<RegistrySnapshot | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    if (!runId) return;

    let cancelled = false;

    fetch(`/api/agent-registry?runId=${encodeURIComponent(runId)}`)
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

          // SSE events are separated by double newlines
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice("data: ".length);
            try {
              const parsed = JSON.parse(raw) as RegistrySnapshot;
              if (parsed.agents !== undefined) {
                setSnapshot(parsed);
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
  }, [runId]);

  return snapshot;
}
