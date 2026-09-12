"use client";

import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabaseUrl } from "./config";

/**
 * Browser client using the anon key. Row level security decides what it may
 * read: `sessions` for everybody (that is how the student timer stays in sync),
 * participants and answers for the owning instructor only.
 */
export function createClient() {
  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) {
    throw new Error(
      "This deployment has no valid NEXT_PUBLIC_SUPABASE_URL. Open /api/health to see what is wrong.",
    );
  }
  return createBrowserClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
