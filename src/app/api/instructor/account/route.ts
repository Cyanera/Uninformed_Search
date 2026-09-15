import { cleanEmail, fail, ok, readJson } from "@/lib/api";
import { isEmailTaken, updateAdminUser } from "@/lib/supabase/gotrue";
import { passwordIsCorrect, requireInstructor } from "@/lib/supabase/instructor";

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
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;
  const { instructor } = guard;

  const body = (await readJson<Body>(request)) ?? {};

  const email = cleanEmail(body.email);
  if (!email) return fail("That does not look like an email address.");

  const password = typeof body.password === "string" ? body.password : "";
  if (!password) return fail("Enter your current password to confirm the change.");

  if (instructor.email.toLowerCase() === email) {
    return ok({ email, changed: false });
  }

  if (!(await passwordIsCorrect(instructor, password))) {
    return fail("That is not your current password.", 403);
  }

  const updated = await updateAdminUser(instructor.url, instructor.serviceKey, instructor.id, {
    email,
    email_confirm: true,
  });
  if (!updated.ok) {
    if (isEmailTaken(updated.error)) {
      return fail("Another account already uses that email address.", 409);
    }
    return fail(`Supabase refused the change: ${updated.error}`, 502);
  }

  return ok({ email, changed: true });
}
