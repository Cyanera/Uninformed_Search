import { Suspense } from "react";
import { JoinForm } from "./JoinForm";

export const metadata = { title: "Join a session" };

export default function JoinPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Join the activity</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Enter the code your instructor is showing on the screen.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-muted">Loading…</p>}>
        <JoinForm />
      </Suspense>
    </main>
  );
}
