"use client";

import type { ChatMessage } from "@/app/components/chat/types";

export function ChatPanel({
  chatHistory,
  completion,
  isLoading,
}: {
  chatHistory: ChatMessage[];
  completion: string;
  isLoading: boolean;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
        🤖 Orchestrator
      </h3>
      <div className="flex flex-col gap-3">
        {chatHistory.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
                🤖
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-br-sm"
                  : "bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700 rounded-bl-sm"
              }`}
            >
              <p className="whitespace-pre-wrap text-xs">{msg.content}</p>
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-full bg-gray-300 dark:bg-zinc-600 flex items-center justify-center text-gray-700 dark:text-zinc-300 text-xs ml-2 mt-1 flex-shrink-0">
                U
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs mr-2 mt-1 flex-shrink-0">
              🤖
            </div>
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed bg-white dark:bg-zinc-800 text-gray-900 dark:text-white border border-gray-200 dark:border-zinc-700">
              {completion ? (
                <p className="whitespace-pre-wrap text-xs">
                  {completion}
                  <span className="inline-block w-2 h-3 ml-1 bg-indigo-500 animate-pulse align-middle rounded-sm" />
                </p>
              ) : (
                <div className="flex gap-1 items-center py-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
