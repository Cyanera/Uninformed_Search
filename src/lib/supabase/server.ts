import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resolveSupabaseUrl } from "./config";

/** Server client bound to the instructor's auth cookies. */
export async function createClient() {
  const cookieStore = await cookies();

  const url = resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!url) {
    throw new Error(
      "This deployment has no valid NEXT_PUBLIC_SUPABASE_URL. Open /api/health to see what is wrong.",
    );
  }

  return createServerClient(
    url,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component; the middleware refreshes the
            // session instead, so this is safe to ignore.
          }
        },
      },
    },
  );
}
