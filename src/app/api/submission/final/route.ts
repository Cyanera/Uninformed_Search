import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateParticipant } from "@/lib/participants";
import { fail, ok, readJson } from "@/lib/api";
import { isLateNow, submissionsOpen } from "@/lib/timer";
import { toPublicSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * "Submit All Answers". Every enabled strategy must already carry an answer.
 * Students may still change their answers afterwards until the timer ends.
 */
export async function POST(request: Request) {
  const body = await readJson<{ participantId?: string; clientToken?: string }>(request);
  if (!body) return fail("Invalid request.");

  const auth = await authenticateParticipant(body.participantId, body.clientToken);
  if (!auth.ok) return fail(auth.error, auth.status);

  const { participant, session } = auth;
  const publicSession = toPublicSession(session);
  const now = Date.now();

  if (!submissionsOpen(publicSession, now)) {
    return fail("Time is up. Your instructor has closed submissions.", 409);
  }

  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("strategy_submissions")
    .select("strategy, answer_json")
    .eq("participant_id", participant.id);

  const answered = new Set(
    (rows ?? [])
      .filter((r) => {
        const a = r.answer_json as { sequence?: unknown[]; iterations?: { sequence: unknown[] }[] };
        if (Array.isArray(a?.sequence)) return a.sequence.length > 0;
        if (Array.isArray(a?.iterations)) return a.iterations.some((i) => i.sequence.length > 0);
        return false;
      })
      .map((r) => r.strategy),
  );

  const missing = session.strategies.filter((s) => !answered.has(s));
  if (missing.length) {
    return fail(`Answer every strategy first. Still missing: ${missing.join(", ")}.`, 409);
  }

  const late = isLateNow(publicSession, now);
  const nowIso = new Date(now).toISOString();

  await admin
    .from("strategy_submissions")
    .update({ status: "submitted", submitted_at: nowIso, updated_at: nowIso, is_late: late })
    .eq("participant_id", participant.id)
    .in("strategy", session.strategies);

  await admin
    .from("student_participants")
    .update({ final_submitted_at: nowIso, is_late: late, last_seen_at: nowIso })
    .eq("id", participant.id);

  return ok({ submittedAt: nowIso, isLate: late });
}
