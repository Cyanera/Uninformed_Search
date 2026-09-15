/**
 * The small slice of Supabase's auth admin API this app needs.
 *
 * supabase-js exposes these as `auth.admin.*`, but reaching them means building
 * a second client purely for user administration. These are plain HTTPS calls,
 * so calling them directly keeps the service-role key in one obvious place and
 * keeps the failure messages readable — which matters, because every one of
 * these calls happens minutes before a lecture.
 *
 * SERVER ONLY: every function here takes the service-role key.
 */

export interface AdminUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
}

export function gotrueHeaders(key: string): Record<string, string> {
  return { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
}

/**
 * An account is only usable if it is confirmed. An account left behind by a
 * sign-up form is waiting on a confirmation email whose link points at the
 * project's Site URL — localhost, by default — so it can never be signed in to.
 */
export function isConfirmed(user: AdminUser): boolean {
  return !!(user.email_confirmed_at || user.confirmed_at);
}

/** Every user, or null if the admin API could not be reached at all. */
export async function listAdminUsers(url: string, key: string): Promise<AdminUser[] | null> {
  try {
    const res = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, {
      headers: gotrueHeaders(key),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { users?: AdminUser[] };
    return body.users ?? [];
  } catch {
    return null;
  }
}

export type AdminResult = { ok: true; user: AdminUser | null } | { ok: false; error: string };

async function adminWrite(
  url: string,
  key: string,
  path: string,
  method: "POST" | "PUT",
  body: Record<string, unknown>,
): Promise<AdminResult> {
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/admin/${path}`, {
      method,
      headers: gotrueHeaders(key),
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Supabase." };
  }

  const text = await res.text().catch(() => "");

  if (res.ok) {
    try {
      return { ok: true, user: JSON.parse(text) as AdminUser };
    } catch {
      return { ok: true, user: null };
    }
  }

  // GoTrue reports failures as JSON, but not always; fall back to the raw body.
  try {
    const parsed = JSON.parse(text) as { msg?: string; message?: string; error_description?: string };
    return { ok: false, error: parsed.msg ?? parsed.message ?? parsed.error_description ?? text };
  } catch {
    return { ok: false, error: text || `Supabase returned ${res.status}.` };
  }
}

/**
 * Change one account. `email_confirm: true` applies a new address immediately
 * rather than mailing a confirmation link to it.
 */
export function updateAdminUser(
  url: string,
  key: string,
  userId: string,
  changes: Record<string, unknown>,
): Promise<AdminResult> {
  return adminWrite(url, key, `users/${userId}`, "PUT", changes);
}

/**
 * Create an account that can be signed in to straight away. Creating one this
 * way skips the confirmation email entirely, which is the point: its link
 * points at the project's Site URL, and nobody should meet that before a class.
 */
export function createAdminUser(
  url: string,
  key: string,
  email: string,
  password: string,
): Promise<AdminResult> {
  return adminWrite(url, key, "users", "POST", { email, password, email_confirm: true });
}

/**
 * Does GoTrue's refusal mean the address is already taken? It words this
 * several ways, and sometimes passes the database's unique-violation text
 * through unchanged.
 */
export function isEmailTaken(error: string): boolean {
  const message = error.toLowerCase();
  return ["already", "registered", "exists", "duplicate"].some((word) => message.includes(word));
}
