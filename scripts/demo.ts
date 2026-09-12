/**
 * Creates a finished demo class.
 *
 *   npm run demo
 *
 * Gives you a completed session populated with students who made the mistakes
 * this activity is designed to catch, so the dashboard, every analytics panel
 * and Teach Mode can be inspected without waiting for a real class.
 *
 * The students themselves live in ./demoData.ts, which is covered by the test
 * suite, so the mistakes advertised below are the mistakes actually detected.
 */
import { CAMPUS_DELIVERY_ROBOT } from "../src/lib/search/problem";
import { generateSessionCode } from "../src/lib/codes";
import { buildDemoStudents, DEMO_DURATION_SECONDS } from "./demoData";
import {
  assertProjectUrl,
  authUrl,
  colors,
  loadEnv,
  note,
  required,
  restUrl,
  serviceHeaders,
  step,
  tick,
} from "./env";

loadEnv();

const projectUrl = assertProjectUrl(required("NEXT_PUBLIC_SUPABASE_URL"));
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const headers = serviceHeaders(serviceKey);

const PROBLEM = CAMPUS_DELIVERY_ROBOT;
const STUDENTS = buildDemoStudents(PROBLEM);

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(restUrl(projectUrl, path), {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

async function resolveOwnerId(): Promise<string> {
  const res = await fetch(authUrl(projectUrl, "admin/users?page=1&per_page=200"), { headers });
  if (!res.ok) throw new Error(`could not list instructor accounts: ${await res.text()}`);

  const body = (await res.json()) as { users?: { id: string; email?: string }[] };
  const users = body.users ?? [];
  if (!users.length) {
    console.error(`
${colors.bad("No instructor account exists yet.")}

  Set INSTRUCTOR_EMAIL and INSTRUCTOR_PASSWORD in .env.local and run
  ${colors.bold("npm run setup")}, or sign up at /instructor/login first.
`);
    process.exit(1);
  }

  const wanted = process.env.INSTRUCTOR_EMAIL?.toLowerCase();
  const owner = (wanted && users.find((u) => u.email?.toLowerCase() === wanted)) || users[0];
  note(`the demo session will belong to ${owner.email ?? owner.id}`);
  return owner.id;
}

async function main(): Promise<void> {
  console.log(colors.bold("\nUninformed Search - demo class\n"));

  step(1, 3, "Finding the instructor account");
  const ownerId = await resolveOwnerId();

  step(2, 3, "Creating a finished session");
  const startedAt = new Date(Date.now() - 22 * 60 * 1000);
  const [session] = await post<{ id: string; code: string }[]>("sessions", {
    code: generateSessionCode(),
    owner_id: ownerId,
    title: "Uninformed Search - demo class",
    problem_snapshot: PROBLEM,
    strategies: ["BFS", "DFS", "IDS", "UCS"],
    duration_seconds: DEMO_DURATION_SECONDS,
    status: "ended",
    started_at: startedAt.toISOString(),
    ended_at: new Date(startedAt.getTime() + DEMO_DURATION_SECONDS * 1000).toISOString(),
    allow_late: true,
    // Already revealed, so every analytics panel has something to show.
    reveal_results: true,
  });
  tick(`session ${colors.bold(session.code)} created`);

  step(3, 3, "Adding students and their answers");
  for (const student of STUDENTS) {
    const finishedAt =
      student.finishedAfter === null
        ? null
        : new Date(startedAt.getTime() + student.finishedAfter * 1000).toISOString();

    const [participant] = await post<{ id: string }[]>("student_participants", {
      session_id: session.id,
      name: student.name,
      student_number: student.number,
      joined_at: new Date(startedAt.getTime() - 60_000).toISOString(),
      last_seen_at: startedAt.toISOString(),
      final_submitted_at: finishedAt,
      is_late: !!student.late,
    });

    const stamp = finishedAt ?? startedAt.toISOString();

    for (const [strategy, answer] of Object.entries(student.answers)) {
      const isDraft = student.drafts?.includes(strategy as never) ?? false;
      await post("strategy_submissions", {
        session_id: session.id,
        participant_id: participant.id,
        strategy,
        answer_json: answer,
        status: isDraft ? "in_progress" : "submitted",
        submitted_at: isDraft ? null : stamp,
        updated_at: stamp,
        is_late: !!student.late,
      });
      if (!isDraft) {
        await post("submission_attempts", {
          session_id: session.id,
          participant_id: participant.id,
          strategy,
          answer_json: answer,
          is_late: !!student.late,
          created_at: stamp,
        });
      }
    }
    tick(`${student.name}${student.blurb ? colors.dim(` - ${student.blurb}`) : ""}`);
  }

  console.log(`
${colors.ok(colors.bold("Demo class ready."))}

  Sign in at ${colors.bold("/instructor")} and open session ${colors.bold(session.code)}.

  Worth looking at:
    ${colors.bold("Live")}        eight students, one late, one who never finished
    ${colors.bold("Analytics")}   accuracy per strategy, where the class first diverged, the
                most common wrong node, completion times, the matrix
    ${colors.bold("Teach Mode")}  choose UCS and step to 7 - the moment G is generated
`);
}

main().catch((error) => {
  console.error(`\n${colors.bad("Demo failed:")} ${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
