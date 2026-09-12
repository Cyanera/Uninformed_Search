import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateParticipant } from "@/lib/participants";
import { answerIsEmpty, fail, isStrategy, ok, readJson, validateAnswer } from "@/lib/api";
import { isLateNow, submissionsOpen } from "@/lib/timer";
import { toPublicSession } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * A student's own answers, for when they rejoin on another device or after a
 * refresh. Only ever returns rows belonging to the authenticated participant.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const auth = await authenticateParticipant(
    url.searchParams.get("participantId"),
    url.searchParams.get("clientToken"),
  );
  if (!auth.ok) return fail(auth.error, auth.status);

  const admin = createAdminClient();
  const { data } = await admin
    .from("strategy_submissions")
    .select("strategy, answer_json, status, submitted_at, is_late")
    .eq("participant_id", auth.participant.id);

  return ok({
    submissions: data ?? [],
    finalSubmittedAt: auth.participant.final_submitted_at,
    session: toPublicSession(auth.session),
    serverNow: Date.now(),
  });
}

interface SubmitBody {
  participantId?: string;
  clientToken?: string;
  strategy?: string;
  answer?: unknown;
  /** "in_progress" autosaves a draft; "submitted" is the student pressing Submit. */
  status?: "in_progress" | "submitted";
}

/**
 * Save or submit one strategy.
 *
 * No correctness information is returned — during the activity the student is
 * told only that the answer was stored, and when. Feedback of any kind would
 * let the class brute-force the answer by repeated guessing.
 */
export async function POST(request: Request) {
  const body = await readJson<SubmitBody>(request);
  if (!body) return fail("Invalid request.");

  const auth = await authenticateParticipant(body.participantId, body.clientToken);
  if (!auth.ok) return fail(auth.error, auth.status);

  const { participant, session } = auth;
  const strategy = body.strategy;
  if (!isStrategy(strategy)) return fail("Unknown strategy.");
  if (!session.strategies.includes(strategy)) {
    return fail("That strategy is not part of this activity.", 409);
  }

  const publicSession = toPublicSession(session);
  const now = Date.now();

  if (!submissionsOpen(publicSession, now)) {
    return fail(
      session.status === "lobby"
        ? "The activity has not started yet."
        : "Time is up. Your instructor has closed submissions.",
      409,
    );
  }

  const validation = validateAnswer(session.problem_snapshot, strategy, body.answer);
  if (!validation.ok) return fail(validation.error);

  const answer = validation.answer;
  const isDraft = body.status !== "submitted";
  const late = isLateNow(publicSession, now);
  const nowIso = new Date(now).toISOString();

  if (!isDraft && answerIsEmpty(answer)) {
    return fail("Add at least one node before submitting this strategy.");
  }

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("strategy_submissions")
    .upsert(
      {
        session_id: session.id,
        participant_id: participant.id,
        strategy,
        answer_json: answer,
        status: isDraft ? "in_progress" : "submitted",
        submitted_at: isDraft ? null : nowIso,
        updated_at: nowIso,
        is_late: late,
      },
      { onConflict: "participant_id,strategy" },
    )
    .select("*")
    .single();

  if (error) return fail("Could not save your answer. Please try again.", 500);

  // Keep the full history of submit presses so the instructor can see how a
  // student's thinking changed during the activity.
  if (!isDraft) {
    await admin.from("submission_attempts").insert({
      session_id: session.id,
      participant_id: participant.id,
      strategy,
      answer_json: answer,
      is_late: late,
    });
  }

  await admin
    .from("student_participants")
    .update({ last_seen_at: nowIso, ...(late && !isDraft ? { is_late: true } : {}) })
    .eq("id", participant.id);

  return ok({
    saved: true,
    strategy,
    status: isDraft ? "in_progress" : "submitted",
    submittedAt: isDraft ? null : nowIso,
    isLate: late,
    id: (data as { id: string }).id,
  });
}
