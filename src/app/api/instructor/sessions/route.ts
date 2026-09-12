import { createClient } from "@/lib/supabase/server";
import { generateSessionCode } from "@/lib/codes";
import { cleanText, fail, ok, readJson } from "@/lib/api";
import { CAMPUS_DELIVERY_ROBOT, cloneProblem, validateProblem } from "@/lib/search/problem";
import { DEFAULT_STRATEGIES, ALL_STRATEGIES, type Strategy } from "@/lib/search/types";
import { DEFAULT_DURATION_SECONDS } from "@/lib/timer";
import { problemRowToProblem, type ProblemRow } from "@/lib/types";

export const dynamic = "force-dynamic";

interface CreateBody {
  title?: string;
  problemId?: string;
  durationSeconds?: number;
  strategies?: string[];
}

const MIN_DURATION = 60;
const MAX_DURATION = 4 * 60 * 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.", 401);

  const body = (await readJson<CreateBody>(request)) ?? {};

  const title = cleanText(body.title, 120) || "Uninformed Search Activity";
  const durationSeconds = Math.min(
    MAX_DURATION,
    Math.max(MIN_DURATION, Math.round(body.durationSeconds ?? DEFAULT_DURATION_SECONDS)),
  );

  const requested = Array.isArray(body.strategies) ? body.strategies : DEFAULT_STRATEGIES;
  const strategies = ALL_STRATEGIES.filter((s) => requested.includes(s)) as Strategy[];
  if (!strategies.length) return fail("Enable at least one strategy.");

  // Freeze the problem into the session, so editing the template later can
  // never change the answer key for work that has already been submitted.
  let problem = cloneProblem(CAMPUS_DELIVERY_ROBOT);
  let problemId: string | null = null;

  if (body.problemId) {
    const { data } = await supabase
      .from("state_space_problems")
      .select("*")
      .eq("id", body.problemId)
      .maybeSingle();
    if (!data) return fail("That problem could not be found.", 404);
    problem = problemRowToProblem(data as ProblemRow);
    problemId = (data as ProblemRow).id;
  }

  const validation = validateProblem(problem);
  if (!validation.ok) return fail(`This problem is not valid: ${validation.errors.join(" ")}`);

  // Codes are short and human-typed, so collisions are possible; retry a few times.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = generateSessionCode();
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        code,
        owner_id: user.id,
        title,
        problem_id: problemId,
        problem_snapshot: problem,
        strategies,
        duration_seconds: durationSeconds,
      })
      .select("*")
      .single();

    if (!error && data) return ok({ session: data }, { status: 201 });
    // 23505 = unique_violation on the code; anything else is a real failure.
    if (error && error.code !== "23505") return fail(error.message, 500);
  }

  return fail("Could not allocate a session code. Please try again.", 500);
}
