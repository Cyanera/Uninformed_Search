import { createClient } from "@supabase/supabase-js";
import { resolveSupabaseUrlDetailed } from "./config";

/**
 * Service-role client. SERVER ONLY.
 *
 * This is what lets students take part without a Supabase account: the join
 * and submit route handlers validate the participant's `client_token`
 * themselves and then write on the student's behalf, so the anon key never
 * needs write access to any table.
 */
export function createAdminClient() {
  const resolved = resolveSupabaseUrlDetailed(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!resolved.url || !key) {
    throw new Error(
      `Supabase is not configured. ${resolved.note ?? ""} Open /api/health for a full report.`.trim(),
    );
  }

  return createClient(resolved.url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
