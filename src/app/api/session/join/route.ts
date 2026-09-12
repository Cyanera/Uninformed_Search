import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSessionCode } from "@/lib/codes";
import { cleanText, fail, ok, readJson } from "@/lib/api";
import { toPublicSession, type SessionRow, type StudentIdentity } from "@/lib/types";

export const dynamic = "force-dynamic";

interface JoinBody {
  code?: string;
  name?: string;
  studentNumber?: string;
}

/**
 * Join a live session. No account, no password: the student gets back a
 * random `client_token` which their browser keeps and presents on every
 * later write.
 */
export async function POST(request: Request) {
  const body = await readJson<JoinBody>(request);
  if (!body) return fail("Invalid request.");

  const code = normalizeSessionCode(body.code ?? "");
  const name = cleanText(body.name, 80);
  const studentNumber = cleanText(body.studentNumber, 40);

  if (!code) return fail("Enter the session code your instructor is showing.");
  if (!name) return fail("Enter your name.");
  if (!studentNumber) return fail("Enter your student ID.");

  const admin = createAdminClient();

  const { data: sessionData } = await admin.from("sessions").select("*").eq("code", code).maybeSingle();
  const session = sessionData as SessionRow | null;

  if (!session) return fail("No session found with that code. Check the code on the screen.", 404);
  if (session.status === "ended" && !session.allow_late) {
    return fail("This activity has already finished.", 409);
  }

  // Rejoining: a student who refreshed, changed device, or cleared their
  // browser storage must be able to get back to their own answers. The name is
  // checked as a light guard; this is a classroom activity, not an exam system.
  const { data: existingData } = await admin
    .from("student_participants")
    .select("*")
    .eq("session_id", session.id)
    .eq("student_number", studentNumber)
    .maybeSingle();

  if (existingData) {
    const existing = existingData as { id: string; name: string; client_token: string };
    if (existing.name.toLowerCase() !== name.toLowerCase()) {
      return fail(
        "That student ID has already joined this session under a different name. Check your student ID.",
        409,
      );
    }
    await admin
      .from("student_participants")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", existing.id);

    const identity: StudentIdentity = {
      participantId: existing.id,
      clientToken: existing.client_token,
      sessionId: session.id,
      sessionCode: session.code,
      name: existing.name,
      studentNumber,
    };
    return ok({ identity, session: toPublicSession(session), serverNow: Date.now(), rejoined: true });
  }

  const { data: createdData, error } = await admin
    .from("student_participants")
    .insert({ session_id: session.id, name, student_number: studentNumber })
    .select("*")
    .single();

  if (error || !createdData) {
    return fail("Could not join the session. Please try again.", 500);
  }

  const created = createdData as { id: string; client_token: string };
  const identity: StudentIdentity = {
    participantId: created.id,
    clientToken: created.client_token,
    sessionId: session.id,
    sessionCode: session.code,
    name,
    studentNumber,
  };

  return ok({ identity, session: toPublicSession(session), serverNow: Date.now(), rejoined: false });
}
