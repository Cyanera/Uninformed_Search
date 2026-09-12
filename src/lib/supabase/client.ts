"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser client using the anon key. Row level security decides what it may
 * read: `sessions` for everybody (that is how the student timer stays in sync),
 * participants and answers for the owning instructor only.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
