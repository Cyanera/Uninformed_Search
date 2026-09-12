import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client. SERVER ONLY.
 *
 * This is what lets students take part without a Supabase account: the join
 * and submit route handlers validate the participant's `client_token`
 * themselves and then write on the student's behalf, so the anon key never
 * needs write access to any table.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (see .env.example).",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
