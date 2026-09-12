import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instructor sign in" };

async function alreadySignedIn(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return !!user;
  } catch {
    // Unreachable project: show the form, which explains the failure.
    return false;
  }
}

export default async function LoginPage() {
  // redirect() signals by throwing, so it must never sit inside the try above.
  if (await alreadySignedIn()) redirect("/instructor");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Instructor sign in</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Students do not sign in. This is only for running and marking the activity.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-muted">Loading…</p>}>
        <LoginForm />
      </Suspense>

      {/* Rendered on the server, so it is visible on a brand new deployment
          before any JavaScript has run. */}
      <p className="mt-6 text-center text-xs text-ink-muted">
        Setting this up for the first time?{" "}
        <Link href="/instructor/setup" className="text-accent underline-offset-2 hover:underline">
          Run first-time setup
        </Link>
      </p>
    </main>
  );
}
