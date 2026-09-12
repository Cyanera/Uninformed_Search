import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Instructor sign in" };

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight">Instructor sign in</h1>
      <p className="mt-2 text-sm text-ink-muted">
        Students do not sign in. This is only for running and marking the activity.
      </p>
      <Suspense fallback={<p className="mt-8 text-sm text-ink-muted">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
