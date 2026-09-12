import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeSessionCode } from "@/lib/codes";
import { fail, ok } from "@/lib/api";
import { toPublicSession, type SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Timer + session state, with the server's own clock so a client can correct
 * for a badly set device clock. Realtime does the live updating; this is the
 * initial read and the fallback if a websocket drops.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = normalizeSessionCode(url.searchParams.get("code") ?? "");
  const id = url.searchParams.get("id");

  if (!code && !id) return fail("Provide a session code.");

  const admin = createAdminClient();
  const query = admin.from("sessions").select("*");
  const { data } = await (code ? query.eq("code", code) : query.eq("id", id!)).maybeSingle();

  const session = data as SessionRow | null;
  if (!session) return fail("Session not found.", 404);

  return ok({ session: toPublicSession(session), serverNow: Date.now() });
}
