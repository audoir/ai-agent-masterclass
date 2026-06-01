"use client";

import type { ChatMessageItem } from "@/lib/types";

function tryParseJSON(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function ToolCallBubble({ content }: { content: string }) {
  const parsed = tryParseJSON(content);
  if (parsed?.type === "tool-call") {
    return (
      <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-700">
        <p className="font-semibold mb-1">🔧 Tool Call: {parsed.toolName}</p>
        <pre className="whitespace-pre-wrap font-mono text-xs opacity-80">{JSON.stringify(parsed.input, null, 2)}</pre>
      </div>
    );
  }
  // Plain assistant message
  return (
    <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-white dark:bg-zinc-700 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-600">
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}

function ToolResultBubble({ content }: { content: string }) {
  const parsed = tryParseJSON(content);
  // Tool message content is an array of tool-result parts
  const parts = Array.isArray(parsed) ? parsed : null;
  if (parts) {
    return (
      <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-200 border border-green-200 dark:border-green-700">
        {parts.map((part: { toolName?: string; result?: unknown }, i: number) => (
          <div key={i}>
            <p className="font-semibold mb-1">✅ Tool Result: {part.toolName}</p>
            <pre className="whitespace-pre-wrap font-mono text-xs opacity-80">{JSON.stringify(part.result, null, 2)}</pre>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-green-50 dark:bg-green-900/20 text-green-900 dark:text-green-200 border border-green-200 dark:border-green-700">
      <p className="whitespace-pre-wrap">{content}</p>
    </div>
  );
}

export function MessageBubble({ msg }: { msg: ChatMessageItem }) {
  if (msg.role === "tool") {
    return (
      <div className="flex justify-start">
        <ToolResultBubble content={msg.content} />
      </div>
    );
  }

  if (msg.role === "assistant") {
    return (
      <div className="flex justify-start">
        <ToolCallBubble content={msg.content} />
      </div>
    );
  }

  // user
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed bg-blue-600 text-white">
        <p className="whitespace-pre-wrap">{msg.content}</p>
      </div>
    </div>
  );
}
