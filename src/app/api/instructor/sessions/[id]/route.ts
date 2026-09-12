import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail, ok, readJson, cleanText } from "@/lib/api";
import { scoreStrategy } from "@/lib/search/scoring";
import { detectMisconceptions } from "@/lib/search/misconceptions";
import { ALL_STRATEGIES, type StateSpaceProblem, type Strategy, type StrategyAnswer } from "@/lib/search/types";
import { validateProblem } from "@/lib/search/problem";
import type { SessionRow, SubmissionRow } from "@/lib/types";

export const dynamic = "force-dynamic";

type Action =
  | "start"
  | "pause"
  | "resume"
  | "add_time"
  | "end"
  | "reveal"
  | "hide"
  | "set_allow_late"
  | "update_settings";

interface ControlBody {
  action?: Action;
  seconds?: number;
  allowLate?: boolean;
  title?: string;
  durationSeconds?: number;
  strategies?: string[];
  problem?: unknown;
}

const MAX_DURATION = 4 * 60 * 60;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Sign in first.", 401);

  const body = (await readJson<ControlBody>(request)) ?? {};

  const { data } = await supabase.from("sessions").select("*").eq("id", id).maybeSingle();
  const session = data as SessionRow | null;
  if (!session) return fail("Session not found.", 404);

  // The SELECT policy on `sessions` is deliberately public - a student's
  // browser has to read the timer - so reading this row proves nothing about
  // ownership. Check it explicitly rather than letting the UPDATE policy fail
  // with a confusing error.
  if (session.owner_id !== user.id) {
    return fail("You do not own this session.", 403);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  let patch: Record<string, unknown> = {};

  switch (body.action) {
    case "start":
      if (session.status === "running") return fail("The activity is already running.", 409);
      // Restarting after it ended gives everyone a clean, synchronised clock.
      patch = {
        status: "running",
        started_at: nowIso,
        paused_at: null,
        accumulated_pause_seconds: 0,
        ended_at: null,
      };
      break;

    case "pause":
      if (session.status !== "running") return fail("The activity is not running.", 409);
      patch = { status: "paused", paused_at: nowIso };
      break;

    case "resume": {
      if (session.status !== "paused" || !session.paused_at) return fail("The activity is not paused.", 409);
      const pausedForSeconds = Math.max(0, Math.round((now.getTime() - Date.parse(session.paused_at)) / 1000));
      patch = {
        status: "running",
        paused_at: null,
        accumulated_pause_seconds: session.accumulated_pause_seconds + pausedForSeconds,
      };
      break;
    }

    case "add_time": {
      const seconds = Math.round(body.seconds ?? 60);
      if (!Number.isFinite(seconds) || seconds === 0) return fail("Invalid amount of time.");
      const next = Math.min(MAX_DURATION, Math.max(60, session.duration_seconds + seconds));
      patch = { duration_seconds: next };
      break;
    }

    case "end":
      patch = { status: "ended", ended_at: nowIso };
      break;

    case "reveal":
      patch = { reveal_results: true };
      break;

    case "hide":
      patch = { reveal_results: false };
      break;

    case "set_allow_late":
      patch = { allow_late: !!body.allowLate };
      break;

    case "update_settings": {
      if (session.status === "running" || session.status === "paused") {
        return fail("Stop the activity before changing its configuration.", 409);
      }
      if (body.title !== undefined) patch.title = cleanText(body.title, 120) || session.title;
      if (body.durationSeconds !== undefined) {
        patch.duration_seconds = Math.min(MAX_DURATION, Math.max(60, Math.round(body.durationSeconds)));
      }
      if (body.strategies !== undefined) {
        const strategies = ALL_STRATEGIES.filter((s) => body.strategies!.includes(s));
        if (!strategies.length) return fail("Enable at least one strategy.");
        patch.strategies = strategies;
      }
      if (body.problem !== undefined) {
        // validateProblem assumes a well-formed object, so check the shape
        // first: a malformed payload must be a 400, not a crash.
        if (!isProblemShaped(body.problem)) {
          return fail("The problem must have nodes, edges, a start node and a goal node.");
        }
        const validation = validateProblem(body.problem);
        if (!validation.ok) return fail(validation.errors.join(" "));
        patch.problem_snapshot = body.problem;
      }
      break;
    }

    default:
      return fail("Unknown action.");
  }

  const { data: updated, error } = await supabase
    .from("sessions")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return fail(error.message, 500);

  if (body.action === "reveal") {
    await persistScores(updated as SessionRow);
  }

  return ok({ session: updated, serverNow: Date.now() });
}

/** Narrow structural check before the semantic validation. */
function isProblemShaped(value: unknown): value is StateSpaceProblem {
  const p = value as Partial<StateSpaceProblem> | null;
  return (
    !!p &&
    typeof p === "object" &&
    typeof p.start === "string" &&
    typeof p.goal === "string" &&
    Array.isArray(p.nodes) &&
    Array.isArray(p.edges) &&
    p.nodes.every((n) => n && typeof (n as { id?: unknown }).id === "string") &&
    p.edges.every(
      (e) =>
        e &&
        typeof (e as { from?: unknown }).from === "string" &&
        typeof (e as { to?: unknown }).to === "string" &&
        typeof (e as { cost?: unknown }).cost === "number",
    )
  );
}

/**
 * Revealing results is also the moment a durable record of the marking is
 * written. This runs with the service role on purpose: instructors hold only
 * SELECT on strategy_submissions, and ownership has already been checked above.
 */
async function persistScores(session: SessionRow) {
  const supabase = createAdminClient();
  const { data } = await supabase.from("strategy_submissions").select("*").eq("session_id", session.id);
  const rows = (data ?? []) as SubmissionRow[];

  for (const row of rows) {
    const strategy = row.strategy as Strategy;
    const answer = row.answer_json as StrategyAnswer;
    const score = scoreStrategy(session.problem_snapshot, strategy, answer);
    const misconceptions = detectMisconceptions(session.problem_snapshot, strategy, answer);

    await supabase
      .from("strategy_submissions")
      .update({
        score_data_json: {
          exactMatch: score.exactMatch,
          correctPrefixLength: score.correctPrefixLength,
          positionsCorrect: score.positionsCorrect,
          positionsTotal: score.positionsTotal,
          positionAccuracy: score.positionAccuracy,
          firstDivergenceIndex: score.firstDivergenceIndex,
          expectedAtDivergence: score.expectedAtDivergence,
          actualAtDivergence: score.actualAtDivergence,
          iterations: score.iterations?.map((i) => ({
            limit: i.limit,
            present: i.present,
            exactMatch: i.exactMatch,
            correctPrefixLength: i.correctPrefixLength,
            firstDivergenceIndex: i.firstDivergenceIndex,
          })),
          misconceptions: misconceptions.map((m) => ({
            code: m.code,
            title: m.title,
            confidence: m.confidence,
          })),
          scoredAt: new Date().toISOString(),
        },
      })
      .eq("id", row.id);
  }
}
