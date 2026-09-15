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

/**
 * Change one account. `email_confirm: true` applies a new address immediately
 * rather than mailing a confirmation link to it.
 */
export async function updateAdminUser(
  url: string,
  key: string,
  userId: string,
  changes: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let res: Response;
  try {
    res = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "PUT",
      headers: gotrueHeaders(key),
      body: JSON.stringify(changes),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not reach Supabase." };
  }

  if (res.ok) return { ok: true };

  // GoTrue reports failures as JSON, but not always; fall back to the raw body.
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { msg?: string; message?: string; error_description?: string };
    return { ok: false, error: body.msg ?? body.message ?? body.error_description ?? text };
  } catch {
    return { ok: false, error: text || `Supabase returned ${res.status}.` };
  }
}
