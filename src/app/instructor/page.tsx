import Link from "next/link";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { CreateSessionForm } from "./CreateSessionForm";
import { SignOutButton } from "./SignOutButton";
import { Badge } from "@/components/ui";
import { formatDuration } from "@/lib/timer";
import type { ProblemRow, SessionRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Instructor" };

const STATUS_TONE = {
  lobby: "neutral",
  running: "accent",
  paused: "warn",
  ended: "muted",
} as const;

export default async function InstructorHome() {
  // A brand new deployment has no database yet. Send people to first-time setup
  // rather than failing on the first query.
  if (!isSupabaseConfigured()) redirect("/instructor/setup");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The guard lives here rather than in middleware: a page that cannot
  // authenticate fails alone, instead of taking every route down with it.
  if (!user) redirect("/instructor/login");

  // Session rows are readable by everyone - that is how a student's browser
  // watches the timer - so this listing has to filter by owner itself rather
  // than leaning on row level security.
  const { data: sessionRows, error: sessionsError } = await supabase
    .from("sessions")
    .select("*")
    .eq("owner_id", user?.id ?? "")
    .order("created_at", { ascending: false })
    .limit(30);

  const { data: problemRows } = await supabase
    .from("state_space_problems")
    .select("*")
    .order("created_at", { ascending: true });

  // 42P01 is "relation does not exist": the tables have not been created yet.
  if (sessionsError?.code === "42P01") redirect("/instructor/setup");

  const sessions = (sessionRows ?? []) as SessionRow[];
  const problems = (problemRows ?? []) as ProblemRow[];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Uninformed Search Activity</h1>
          <p className="mt-1 text-sm text-ink-muted">{user?.email}</p>
        </div>
        <SignOutButton />
      </header>

      <section className="mt-8">
        <h2 className="text-sm font-semibold tracking-tight">Start a new session</h2>
        <CreateSessionForm problems={problems} />
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold tracking-tight">Your sessions</h2>
        {sessions.length === 0 ? (
          <p className="mt-3 rounded border border-line bg-canvas p-4 text-sm text-ink-muted">
            No sessions yet. Create one above; the code it generates is what students type in.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded border border-line">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  href={`/instructor/session/${session.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-canvas"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-lg font-semibold tracking-[0.15em]">{session.code}</span>
                      <Badge tone={STATUS_TONE[session.status]}>{session.status}</Badge>
                      {session.reveal_results && <Badge tone="goal">results released</Badge>}
                    </span>
                    <span className="mt-0.5 block truncate text-sm text-ink-muted">
                      {session.title} · {session.problem_snapshot.name} ·{" "}
                      {formatDuration(session.duration_seconds)} ·{" "}
                      {(session.strategies ?? []).join(", ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm text-ink-muted">
                    {new Date(session.created_at).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
