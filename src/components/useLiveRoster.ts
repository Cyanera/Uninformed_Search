"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ParticipantRow, SubmissionRow } from "@/lib/types";

/**
 * Live roster for the instructor dashboard.
 *
 * Row level security means this stream can only ever carry rows from sessions
 * the signed-in instructor owns. As with the student timer, a slow poll runs
 * alongside the subscription so a dropped socket cannot leave a lecture-theatre
 * projector showing stale numbers.
 */
export function useLiveRoster(
  sessionId: string,
  initialParticipants: ParticipantRow[],
  initialSubmissions: SubmissionRow[],
) {
  const [participants, setParticipants] = useState(initialParticipants);
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [connected, setConnected] = useState(false);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  if (!supabaseRef.current) supabaseRef.current = createClient();
  const supabase = supabaseRef.current;

  const refetch = useCallback(async () => {
    const [{ data: p }, { data: s }] = await Promise.all([
      supabase.from("student_participants").select("*").eq("session_id", sessionId).order("joined_at"),
      supabase.from("strategy_submissions").select("*").eq("session_id", sessionId),
    ]);
    if (p) setParticipants(p as ParticipantRow[]);
    if (s) setSubmissions(s as SubmissionRow[]);
  }, [supabase, sessionId]);

  useEffect(() => {
    const upsert = <T extends { id: string }>(rows: T[], row: T): T[] => {
      const i = rows.findIndex((r) => r.id === row.id);
      if (i === -1) return [...rows, row];
      const next = [...rows];
      next[i] = row;
      return next;
    };

    const channel = supabase
      .channel(`roster:${sessionId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "student_participants", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            setParticipants((prev) => prev.filter((p) => p.id !== old.id));
          } else {
            setParticipants((prev) => upsert(prev, payload.new as ParticipantRow));
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "strategy_submissions", filter: `session_id=eq.${sessionId}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const old = payload.old as { id?: string };
            setSubmissions((prev) => prev.filter((s) => s.id !== old.id));
          } else {
            setSubmissions((prev) => upsert(prev, payload.new as SubmissionRow));
          }
        },
      )
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, sessionId]);

  useEffect(() => {
    const id = window.setInterval(() => void refetch(), 20000);
    return () => window.clearInterval(id);
  }, [refetch]);

  return { participants, submissions, connected, refetch };
}
