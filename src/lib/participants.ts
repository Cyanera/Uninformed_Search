import { createAdminClient } from "@/lib/supabase/admin";
import type { ParticipantRow, SessionRow } from "@/lib/types";

/**
 * Resolve "I am this participant" from the token issued at join time.
 *
 * Students have no account, so this token — random, stored in the browser,
 * never shown in any UI — is what stops one student writing answers into
 * another student's row.
 */
export async function authenticateParticipant(
  participantId: unknown,
  clientToken: unknown,
): Promise<
  | { ok: true; participant: ParticipantRow; session: SessionRow }
  | { ok: false; error: string; status: number }
> {
  if (typeof participantId !== "string" || typeof clientToken !== "string") {
    return { ok: false, error: "Missing participant credentials.", status: 401 };
  }

  const admin = createAdminClient();
  const { data: participant, error } = await admin
    .from("student_participants")
    .select("*")
    .eq("id", participantId)
    .eq("client_token", clientToken)
    .maybeSingle();

  if (error) return { ok: false, error: "Could not verify your session.", status: 500 };
  if (!participant) {
    return { ok: false, error: "This device is no longer recognised. Please join the session again.", status: 401 };
  }

  const { data: session } = await admin
    .from("sessions")
    .select("*")
    .eq("id", participant.session_id)
    .maybeSingle();

  if (!session) return { ok: false, error: "This session no longer exists.", status: 404 };

  return { ok: true, participant: participant as ParticipantRow, session: session as SessionRow };
}

export async function touchParticipant(participantId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("student_participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", participantId);
}
