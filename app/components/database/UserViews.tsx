"use client";

import { useState } from "react";
import type { DatabaseData, SemanticMemoryItem } from "@/lib/types";
import { SessionCard } from "./SessionCard";
import { SemanticMemoryRow } from "./MemoryRows";

// ─── SemanticMemorySection ────────────────────────────────────────────────────

function SemanticMemorySection({ memories }: { memories: SemanticMemoryItem[] }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-violet-200 dark:border-violet-800 overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
          💡 Semantic Memory (user-level)
        </span>
        <span className="text-xs px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-800 dark:text-violet-300 font-medium">
          {memories.length} entr{memories.length !== 1 ? "ies" : "y"}
        </span>
        <svg
          className={`w-3.5 h-3.5 text-violet-400 ml-auto flex-shrink-0 transition-transform ${
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
        <div className="p-2 space-y-1.5 border-t border-violet-200 dark:border-violet-800">
          {/* Show newest first (reverse the array) */}
          {[...memories].reverse().map((mem, i) => (
            <SemanticMemoryRow key={`semantic-${i}`} memory={mem} isLatest={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── UserRow ──────────────────────────────────────────────────────────────────

function UserRow({
  user,
  userSessions,
  isExpanded,
  onToggle,
}: {
  user: DatabaseData["users"][number];
  userSessions: DatabaseData["chat_sessions"];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const userSemanticMemories = user.semantic_memories ?? [];
  return (
    <div className="rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
      {/* User row */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-zinc-700/30 transition-colors bg-white dark:bg-zinc-800"
        onClick={onToggle}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {user.display_name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            {user.display_name}
          </p>
          <p className="text-xs text-gray-400 dark:text-zinc-600 font-mono truncate">
            {user.id}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs text-gray-500 dark:text-zinc-400">
          <span>
            {user.session_count ?? 0} session
            {(user.session_count ?? 0) !== 1 ? "s" : ""}
          </span>
          {userSemanticMemories.length > 0 && (
            <span className="text-violet-500 dark:text-violet-400">
              💡 {userSemanticMemories.length}
            </span>
          )}
          <span className="text-gray-400 dark:text-zinc-600 font-mono">
            {user.created_at}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content: semantic memory + sessions */}
      {isExpanded && (
        <div className="border-t border-gray-100 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900 p-3 space-y-3">
          {/* Semantic memory (user-level) */}
          {userSemanticMemories.length > 0 && (
            <SemanticMemorySection memories={userSemanticMemories} />
          )}

          {/* Sessions */}
          {userSessions.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-zinc-600 text-center py-3">
              No sessions yet.
            </p>
          ) : (
            userSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Users View ───────────────────────────────────────────────────────────────
//
// Shows all users with their sessions and memory. Used in the legacy database
// view (if re-enabled) or anywhere a full user list is needed.

export function UsersView({
  data,
  expandedUser,
  setExpandedUser,
}: {
  data: DatabaseData;
  expandedUser: string | null;
  setExpandedUser: (id: string | null) => void;
}) {
  if (data.users.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-zinc-600 text-sm">
        No users yet. Users are created when you open the 🤖 Orchestrator + SubAgents tab.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {data.users.map((user) => {
        const isExpanded = expandedUser === user.id;
        const userSessions = (data.chat_sessions ?? []).filter(
          (s) => s.user_id === user.id
        );
        return (
          <UserRow
            key={user.id}
            user={user}
            userSessions={userSessions}
            isExpanded={isExpanded}
            onToggle={() => setExpandedUser(isExpanded ? null : user.id)}
          />
        );
      })}
    </div>
  );
}

// ─── Single User View ─────────────────────────────────────────────────────────
//
// Shows the full user state scoped to a single userId.
// Used in each agent tab (Orchestrator, Swarm, Checkpoints, HITL) to display
// the current user's memory state alongside the chat.

export function SingleUserView({
  data,
  userId,
}: {
  data: DatabaseData | null;
  userId: string | null;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  if (!data || !userId) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-zinc-600 text-sm">
        Loading user data…
      </div>
    );
  }

  const user = data.users.find((u) => u.id === userId);

  if (!user) {
    return (
      <div className="text-center py-12 text-gray-400 dark:text-zinc-600 text-sm">
        No data yet for this user. Start a run to see your memory state here.
      </div>
    );
  }

  const userSessions = (data.chat_sessions ?? []).filter(
    (s) => s.user_id === userId
  );

  return (
    <div className="space-y-3">
      <UserRow
        user={user}
        userSessions={userSessions}
        isExpanded={isExpanded}
        onToggle={() => setIsExpanded((v) => !v)}
      />
    </div>
  );
}
