import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "First-time setup" };

export default function SetupPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">Uninformed Search Activity</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">First-time setup</h1>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-muted">
        This runs once. It creates the database tables your students&rsquo; answers will be stored in, adds
        the built-in Campus Delivery Robot problem, and creates your instructor account.
      </p>
      <SetupForm />
    </main>
  );
}
