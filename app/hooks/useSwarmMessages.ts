"use client";

import { useCallback, useRef, useState } from "react";

// ─── Message types ────────────────────────────────────────────────────────────

export type SwarmChatMessage =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "handoff-summary"; content: string }
  | { kind: "agent-running"; agent: string }
  | { kind: "done"; summary: string }
  | { kind: "tool-call"; toolName: string; input: unknown };

// ─── Agent display helpers ────────────────────────────────────────────────────

const AGENT_EMOJIS: Record<string, string> = {
  entry: "🚀",
  researcher: "🔍",
  writer: "✍️",
  editor: "📝",
};

export function agentLabel(name: string) {
  return `${AGENT_EMOJIS[name] ?? "🤖"} ${name}`;
}

// ─── Raw DB message → SwarmChatMessage ───────────────────────────────────────
//
// The server sends ALL assistant messages including tool-call JSON blobs.
// We parse each one and decide how to render it:
//   - Plain text assistant messages → { kind: "assistant" }
//   - Tool-call blobs with toolName "handoff" → { kind: "handoff" }
//   - Tool-call blobs with toolName "done"    → { kind: "done" }
//   - All other tool-call blobs               → { kind: "tool-call" } (filtered in UI)
//   - User messages                           → { kind: "user" }

function parseRawMessages(
  rows: { role: string; content: string }[],
): SwarmChatMessage[] {
  const result: SwarmChatMessage[] = [];
  // Track the current agent: starts at "entry", advances to the handoff target
  let currentAgent = "entry";

  for (const row of rows) {
    if (row.role === "user") {
      result.push({ kind: "user", content: row.content });
      continue;
    }

    if (row.role === "assistant") {
      // Try to parse as a tool-call blob
      try {
        const parsed = JSON.parse(row.content) as {
          type?: string;
          toolName?: string;
          input?: unknown;
        };

        if (parsed?.type === "tool-call" && parsed.toolName) {
          if (parsed.toolName === "handoff") {
            const inp = parsed.input as { agentName?: string; summary?: string; instructions?: string } | undefined;
            const to = inp?.agentName ?? "unknown";
            const summary = inp?.summary;
            // Show the handoff summary as a distinct handoff-summary bubble
            if (summary) {
              result.push({ kind: "handoff-summary", content: summary });
            }
            result.push({ kind: "agent-running", agent: to });
            currentAgent = to;
          } else if (parsed.toolName === "done") {
            const inp = parsed.input as { summary?: string } | undefined;
            result.push({ kind: "done", summary: inp?.summary ?? "" });
          } else {
            result.push({ kind: "tool-call", toolName: parsed.toolName, input: parsed.input });
          }
          continue;
        }
      } catch {
        // not JSON — fall through to plain text
      }

      result.push({ kind: "assistant", content: row.content });
    }
  }

  return result;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface SwarmState {
  messages: SwarmChatMessage[];
  isLoading: boolean;
  error: string | null;
}

type RawEvent =
  | { type: "messages"; messages: { role: string; content: string }[] }
  | { type: "error"; error: string };

/**
 * Manages the swarm run lifecycle.
 * Call `startRun(prompt, runId, userId)` to kick off a run.
 * Reads the SSE stream from POST /api/swarm and builds a parsed message list.
 */
export function useSwarmMessages() {
  const [state, setState] = useState<SwarmState>({
    messages: [],
    isLoading: false,
    error: null,
  });
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const reset = useCallback(() => {
    readerRef.current?.cancel();
    readerRef.current = null;
    setState({ messages: [], isLoading: false, error: null });
  }, []);

  const startRun = useCallback(
    async (prompt: string, runId: string, userId: string) => {
      readerRef.current?.cancel();
      readerRef.current = null;

      setState({ messages: [], isLoading: true, error: null });

      try {
        const res = await fetch("/api/swarm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, runId, userId }),
        });

        if (!res.ok || !res.body) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
        }

        const reader = res.body.getReader();
        readerRef.current = reader;
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";

          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice("data: ".length);

            let parsed: RawEvent;
            try {
              parsed = JSON.parse(raw) as RawEvent;
            } catch {
              continue;
            }

            if (parsed.type === "messages") {
              setState((prev) => ({
                ...prev,
                messages: parseRawMessages(parsed.messages),
              }));
            } else if (parsed.type === "error") {
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: parsed.error,
              }));
            }
          }
        }

        setState((prev) => ({ ...prev, isLoading: false }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      }
    },
    [],
  );

  return { ...state, startRun, reset };
}
