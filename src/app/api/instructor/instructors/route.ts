import { cleanEmail, fail, ok, readJson } from "@/lib/api";
import { createAdminUser, isConfirmed, isEmailTaken, listAdminUsers } from "@/lib/supabase/gotrue";
import { passwordIsCorrect, requireInstructor } from "@/lib/supabase/instructor";

export const dynamic = "force-dynamic";

/**
 * Adding a colleague.
 *
 * First-time setup creates one account and then refuses to run again, which is
 * right — it is unauthenticated. A second teacher therefore has to be added by
 * a teacher who is already signed in, and that is all this route does.
 *
 * The account is created already confirmed, so it can be signed in to at once.
 * Supabase's own sign-up would instead mail a confirmation link pointing at the
 * project's Site URL — localhost on a fresh project — and an account whose
 * owner follows that link is stranded.
 *
 * Instructors are peers, not admins over one another: a session's participants
 * and answers are readable only by the instructor who created it, so adding a
 * colleague shares the app, never the class data.
 */

interface Body {
  email?: unknown;
  password?: unknown;
  currentPassword?: unknown;
}

/** Supabase's own floor. Anything shorter is rejected by GoTrue anyway. */
const MIN_PASSWORD = 6;
/** bcrypt ignores bytes past 72, so a longer one is a false sense of security. */
const MAX_PASSWORD = 72;

/** A ceiling, so a stolen session cannot quietly mint accounts without end. */
const MAX_INSTRUCTORS = 20;

export async function GET() {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;
  const { instructor } = guard;

  const users = await listAdminUsers(instructor.url, instructor.serviceKey);
  if (!users) return fail("Could not read the account list from Supabase.", 502);

  return ok({
    instructors: users.filter(isConfirmed).map((user) => ({
      id: user.id,
      email: user.email ?? "",
      isYou: user.id === instructor.id,
    })),
  });
}

export async function POST(request: Request) {
  const guard = await requireInstructor();
  if (!guard.ok) return guard.response;
  const { instructor } = guard;

  const body = (await readJson<Body>(request)) ?? {};

  const email = cleanEmail(body.email);
  if (!email) return fail("That does not look like an email address.");

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD) {
    return fail(`The new password must be at least ${MIN_PASSWORD} characters.`);
  }
  if (password.length > MAX_PASSWORD) {
    return fail(`The new password must be at most ${MAX_PASSWORD} characters.`);
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  if (!currentPassword) return fail("Enter your own password to confirm.");

  if (!(await passwordIsCorrect(instructor, currentPassword))) {
    return fail("That is not your password.", 403);
  }

  const existing = await listAdminUsers(instructor.url, instructor.serviceKey);
  if (existing && existing.filter(isConfirmed).length >= MAX_INSTRUCTORS) {
    return fail(`This app is limited to ${MAX_INSTRUCTORS} instructor accounts.`, 409);
  }

  const created = await createAdminUser(instructor.url, instructor.serviceKey, email, password);
  if (!created.ok) {
    if (isEmailTaken(created.error)) {
      return fail("An account already exists for that email address.", 409);
    }
    return fail(`Supabase refused the new account: ${created.error}`, 502);
  }

  return ok({ email }, { status: 201 });
}
