import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch {
    // Last line of defence. A crash here is served by the platform as a 500 for
    // the whole route, so nothing may escape: the student pages and the setup
    // page must keep working even when auth cannot.
    return NextResponse.next();
  }
}

export const config = {
  /*
   * Only the instructor area needs a session. Students never do, and neither do
   * the API routes, which authenticate themselves. Keeping the matcher narrow
   * means an auth problem can never affect a class that is already running.
   */
  matcher: ["/instructor/:path*"],
};
