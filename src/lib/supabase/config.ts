/**
 * Is this deployment pointed at a usable Supabase project?
 *
 * Checked before any server page tries to talk to the database, so a fresh
 * deployment sends people to first-time setup instead of failing with a 500.
 */
export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
