import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the instructor's auth cookie and guards the /instructor area.
 *
 * This runs on every matched request, so it must never be able to take the site
 * down. A misconfigured or unreachable Supabase project is a state the app has
 * to survive — especially before setup has been run, when /instructor/setup is
 * the one page that has to work.
 */

function looksLikeUrl(value: string | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export async function updateSession(request: NextRequest) {
  const response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Nothing configured yet, or configured wrongly: let every request through so
  // the setup page can explain the problem instead of the whole site 500ing.
  if (!looksLikeUrl(url) || !key) return response;

  try {
    return await guard(request, url, key);
  } catch {
    // Supabase unreachable, a malformed key, an expired token the library
    // chokes on — none of that is a reason to serve an error page.
    return response;
  }
}

async function guard(request: NextRequest, url: string, key: string) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // /instructor/setup is deliberately open: it is how the first account gets
  // created, and it refuses to do anything once one exists.
  const isProtected =
    path.startsWith("/instructor") &&
    !path.startsWith("/instructor/login") &&
    !path.startsWith("/instructor/setup");

  if (!user && isProtected) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/instructor/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  if (user && path === "/instructor/login") {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/instructor";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
