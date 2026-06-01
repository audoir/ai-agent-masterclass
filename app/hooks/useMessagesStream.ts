"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessageItem } from "@/lib/types";

export interface MessagesSnapshot {
  messages: ChatMessageItem[];
  checkpointMessageIds: Set<string>;
}

/**
 * Opens a persistent SSE connection to /api/checkpoints for the given
 * sessionId and returns the latest messages array and the set of message ids
 * that have a checkpoint. Reconnects automatically whenever sessionId changes,
 * and cancels the stream on unmount or when enabled=false.
 */
export function useMessagesStream(
  sessionId: string | null,
  { enabled = true }: { enabled?: boolean } = {},
): MessagesSnapshot {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [checkpointMessageIds, setCheckpointMessageIds] = useState<Set<string>>(new Set());
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    if (!sessionId || !enabled) return;

    setMessages([]);
    let cancelled = false;

    fetch(`/api/checkpoints?sessionId=${encodeURIComponent(sessionId)}`)
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
                messages: ChatMessageItem[];
                checkpointMessageIds?: string[];
              };
              if (Array.isArray(parsed.messages)) {
                setMessages(parsed.messages);
              }
              if (Array.isArray(parsed.checkpointMessageIds)) {
                setCheckpointMessageIds(new Set(parsed.checkpointMessageIds));
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
  }, [sessionId, enabled]);

  return { messages, checkpointMessageIds };
}
