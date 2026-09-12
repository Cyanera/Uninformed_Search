"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { computeTimer, type TimerState } from "@/lib/timer";
import { toPublicSession, type PublicSession, type SessionRow } from "@/lib/types";

/**
 * Keeps one session row live in the browser.
 *
 * Two independent mechanisms, because a lecture theatre's wifi is not a
 * laboratory: a realtime subscription for instant updates, and a slow poll that
 * repairs the state if the socket ever drops. The poll also re-measures the
 * offset between this device's clock and the server's, so a student whose phone
 * clock is wrong still sees the same countdown as everybody else.
 */
export function useLiveSession(
  initialSession: PublicSession,
  initialServerNow: number,
): { session: PublicSession; timer: TimerState; serverNow: number } {
  const [session, setSession] = useState(initialSession);
  const [, setTick] = useState(0);
  const offsetRef = useRef(initialServerNow - Date.now());

  // The instructor's own actions re-render the server component with a fresh
  // session; without this the hook would keep showing the state it mounted
  // with until the next poll, so a button press looked like it did nothing.
  useEffect(() => {
    setSession(initialSession);
  }, [initialSession]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`session:${initialSession.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sessions", filter: `id=eq.${initialSession.id}` },
        (payload) => setSession(toPublicSession(payload.new as SessionRow)),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialSession.id]);

  // One tick per second drives the countdown; the value itself is always
  // recomputed from the session's absolute timestamps, never decremented.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/session/state?id=${initialSession.id}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { session: PublicSession; serverNow: number };
        if (cancelled) return;
        offsetRef.current = data.serverNow - Date.now();
        setSession(data.session);
      } catch {
        // Offline for a moment; the next poll will catch up.
      }
    };
    const id = window.setInterval(refresh, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [initialSession.id]);

  const serverNow = Date.now() + offsetRef.current;
  const timer = useMemo(() => computeTimer(session, serverNow), [session, serverNow]);

  return { session, timer, serverNow };
}
