"use client";

import { useCallback, useEffect, useState } from "react";

const BASE_USER_ID_KEY = "ai_masterclass_user_id";

export function useSession(creator?: "orchestrator" | "swarm" | "checkpoints" | "hitl") {
  // Each creator gets its own localStorage key so switching tabs doesn't
  // overwrite another view's userId and cause it to change on "New Run".
  const USER_ID_KEY = creator ? `${BASE_USER_ID_KEY}_${creator}` : BASE_USER_ID_KEY;

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const createSession = useCallback(() => {
    setSessionId(null);

    // Persist userId in localStorage so the same user is recognised across page reloads
    const storedUserId = typeof window !== "undefined"
      ? localStorage.getItem(USER_ID_KEY)
      : null;

    fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...(storedUserId ? { userId: storedUserId } : {}), ...(creator ? { creator } : {}) }),
    })
      .then((res) => res.json())
      .then((data: { userId: string; sessionId: string }) => {
        setUserId(data.userId);
        setSessionId(data.sessionId);
        if (typeof window !== "undefined") {
          localStorage.setItem(USER_ID_KEY, data.userId);
        }
      })
      .catch(() => {
        const fallbackUserId = storedUserId ?? `user_${Date.now()}_fallback`;
        const fallbackSessionId = `session_${Date.now()}_fallback`;
        setUserId(fallbackUserId);
        setSessionId(fallbackSessionId);
      });
  }, [creator]);

  useEffect(() => {
    createSession();
  }, [createSession]);

  return { sessionId, userId, resetSession: createSession };
}
