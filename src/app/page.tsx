import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-medium uppercase tracking-wide text-ink-muted">
        Principles of Artificial Intelligence
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Uninformed Search Activity</h1>
      <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-muted">
        Solve one state space four ways — breadth-first, depth-first, iterative deepening and uniform-cost
        search — and record the order in which nodes are processed. The activity is about the search
        process, not just the path to the goal.
      </p>

      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        <Link
          href="/join"
          className="flex min-h-[64px] items-center justify-between rounded border border-accent bg-accent px-5 text-base font-semibold text-white transition-colors hover:bg-[#1A43BE]"
        >
          Join as a student
          <span aria-hidden>&rarr;</span>
        </Link>
        <Link
          href="/instructor"
          className="flex min-h-[64px] items-center justify-between rounded border border-line-strong bg-paper px-5 text-base font-semibold text-ink transition-colors hover:bg-canvas"
        >
          Instructor
          <span aria-hidden>&rarr;</span>
        </Link>
      </div>

      <p className="mt-8 text-sm text-ink-muted">
        Students need only the session code shown on the classroom screen. No account required.
      </p>
    </main>
  );
}
