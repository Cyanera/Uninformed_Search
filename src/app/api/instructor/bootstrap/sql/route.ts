import { MIGRATION_SQL, SEED_SQL } from "@/lib/setup/schema.generated";

export const dynamic = "force-dynamic";

/**
 * The setup SQL, served by the deployment itself.
 *
 * When an instance has no direct Postgres connection it cannot create its own
 * tables, and the fallback is to paste this into the Supabase SQL Editor.
 * Serving it from the app means there is nothing to go and find: the setup page
 * can show it with a copy button. The content is the same SQL that is public in
 * the repository, so there is nothing sensitive here.
 */
export async function GET() {
  const sql = [
    "-- Uninformed Search Activity - full setup.",
    "-- Paste all of this into the Supabase SQL Editor and press Run.",
    "-- Safe to run more than once.",
    "",
    MIGRATION_SQL,
    "",
    SEED_SQL,
  ].join("\n");

  return new Response(sql, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
