/**
 * Works out the Supabase API URL from whatever was pasted into the environment.
 *
 * "Invalid supabaseUrl" is the single most common way a deployment of this app
 * fails, because there are four plausible things to copy and only one of them
 * is the API URL. Rather than throw — which takes the page down, including the
 * setup page that exists to fix it — the obvious mistakes are repaired here:
 *
 *   abcdefghijklmnop                                  -> https://abcdefghijklmnop.supabase.co
 *   abcdefghijklmnop.supabase.co                      -> https://abcdefghijklmnop.supabase.co
 *   https://supabase.com/dashboard/project/abcdefg…   -> https://abcdefghijklmnop.supabase.co
 *   https://abcdefghijklmnop.supabase.co/             -> https://abcdefghijklmnop.supabase.co
 *
 * Anything genuinely unusable resolves to null, and callers send the visitor to
 * first-time setup instead of failing.
 */

export interface ResolvedUrl {
  url: string | null;
  /** What was wrong, when it could not be resolved or had to be repaired. */
  note?: string;
  repaired?: boolean;
}

export function resolveSupabaseUrlDetailed(raw: string | undefined): ResolvedUrl {
  if (!raw) return { url: null, note: "Not set." };

  // A stray newline or quote from a copy-paste is common and invisible.
  const value = raw.trim().replace(/^["']|["']$/g, "").replace(/\/+$/, "");
  if (!value) return { url: null, note: "Empty." };

  const dashboard = value.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{16,})/i);
  if (dashboard) {
    return {
      url: `https://${dashboard[1]}.supabase.co`,
      repaired: true,
      note: "The dashboard URL was given; using the project's API URL instead.",
    };
  }

  if (/^[a-z0-9]{16,}$/i.test(value)) {
    return {
      url: `https://${value}.supabase.co`,
      repaired: true,
      note: "A bare project ref was given; expanded to the API URL.",
    };
  }

  if (/^[a-z0-9]{16,}\.supabase\.(co|in)$/i.test(value)) {
    return { url: `https://${value}`, repaired: true, note: "Added the missing https://" };
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return { url: null, note: `Unsupported protocol "${parsed.protocol}".` };
    }
    if (parsed.hostname === "supabase.com") {
      return { url: null, note: "This points at supabase.com, not at your project's API URL." };
    }
    return { url: `${parsed.protocol}//${parsed.host}` };
  } catch {
    return { url: null, note: "Not a valid URL, a project ref, or a project hostname." };
  }
}

export function resolveSupabaseUrl(raw: string | undefined): string | null {
  return resolveSupabaseUrlDetailed(raw).url;
}

/** The API URL for this deployment, or null when it cannot be determined. */
export function supabaseUrl(): string | null {
  return resolveSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/** Is this deployment pointed at a usable Supabase project? */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl() && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}
