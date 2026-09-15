import { createClient as createPlainClient } from "@supabase/supabase-js";
import type { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { resolveSupabaseUrl } from "./config";
import { createClient } from "./server";

/**
 * The guard shared by the routes that administer instructor accounts.
 *
 * Both of them do the same two things before touching anything: establish who
 * is asking from the auth cookie, and make them retype their password. Keeping
 * that in one place means the two can never drift into disagreeing about what
 * counts as authorised.
 */

export interface Instructor {
  id: string;
  email: string;
  url: string;
  anonKey: string;
  serviceKey: string;
}

export async function requireInstructor(): Promise<
  { ok: true; instructor: Instructor } | { ok: false; response: NextResponse }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, response: fail("Sign in first.", 401) };

  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey || !serviceKey) {
    return {
      ok: false,
      response: fail("This deployment is not fully configured. Open /api/health for a report.", 500),
    };
  }

  return { ok: true, instructor: { id: user.id, email: user.email ?? "", url, anonKey, serviceKey } };
}

/**
 * Confirm the password belongs to this account.
 *
 * Signing in on a throwaway client, rather than the cookie-bound one, means
 * checking the password cannot disturb the session of the request doing the
 * checking.
 */
export async function passwordIsCorrect(instructor: Instructor, password: string): Promise<boolean> {
  if (!password || !instructor.email) return false;

  const verifier = createPlainClient(instructor.url, instructor.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await verifier.auth.signInWithPassword({
    email: instructor.email,
    password,
  });
  return !error;
}
