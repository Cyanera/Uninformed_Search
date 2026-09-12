import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toPublicSession, type ParticipantRow, type SessionRow, type SubmissionRow } from "@/lib/types";
import { Dashboard } from "./Dashboard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("code, title").eq("id", id).maybeSingle();
  return { title: data ? `${data.code} · ${data.title}` : "Session" };
}

export default async function SessionDashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sessionData } = await supabase.from("sessions").select("*").eq("id", id).maybeSingle();
  if (!sessionData) notFound();

  // Session rows are world-readable so that students can watch the timer, so
  // this dashboard has to check ownership itself. Without this, another
  // instructor could open the URL and see the session shell (the roster stays
  // empty either way, because that is protected by row level security).
  if ((sessionData as SessionRow).owner_id !== user?.id) notFound();

  const [{ data: participants }, { data: submissions }] = await Promise.all([
    supabase.from("student_participants").select("*").eq("session_id", id).order("joined_at"),
    supabase.from("strategy_submissions").select("*").eq("session_id", id),
  ]);

  return (
    <Dashboard
      initialSession={toPublicSession(sessionData as SessionRow)}
      serverNow={Date.now()}
      initialParticipants={(participants ?? []) as ParticipantRow[]}
      initialSubmissions={(submissions ?? []) as SubmissionRow[]}
    />
  );
}
