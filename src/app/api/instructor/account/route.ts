import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cleanEmail, fail, ok, readJson } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { resolveSupabaseUrl } from "@/lib/supabase/config";
import { updateAdminUser } from "@/lib/supabase/gotrue";

export const dynamic = "force-dynamic";

/**
 * Change the signed-in instructor's own sign-in email.
 *
 * Supabase's own `updateUser({ email })` mails a confirmation link to the new
 * address, and that link points at the project's Site URL — localhost on a
 * fresh project. Following it is how an account ends up stranded. So this route
 * applies the new address directly with the service-role key instead: the
 * instructor signs in with it immediately, no email involved.
 *
 * Two things keep that safe. The account changed is always the one identified
 * by the auth cookie, never one named in the request, so this cannot retarget
 * somebody else's account. And the current password must be supplied, so a
 * lecture-room laptop left unlocked for a minute cannot be used to move the
 * account to an address its owner does not control.
 */

interface Body {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.", 401);

  const body = (await readJson<Body>(request)) ?? {};

  const email = cleanEmail(body.email);
  if (!email) return fail("That does not look like an email address.");

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) return fail("Enter your current password to confirm the change.");

  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return fail("This deployment is not fully configured. Open /api/health for a report.", 500);
  }

  if (user.email?.toLowerCase() === email) {
    return ok({ email, changed: false });
  }

  // Re-authenticate on a throwaway client so verifying the password cannot
  // disturb the cookies of the session making the request.
  const verifier = createPlainClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: passwordError } = await verifier.auth.signInWithPassword({
    email: user.email ?? "",
    password,
  });
  if (passwordError) return fail("That is not your current password.", 403);

  const updated = await updateAdminUser(url, serviceKey, user.id, { email, email_confirm: true });
  if (!updated.ok) {
    const message = updated.error.toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      return fail("Another account already uses that email address.", 409);
    }
    return fail(`Supabase refused the change: ${updated.error}`, 502);
  }

  return ok({ email, changed: true });
}
