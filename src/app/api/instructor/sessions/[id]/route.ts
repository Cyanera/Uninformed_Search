import { createClient } from "@/lib/supabase/server";
import { fail, ok, readJson, cleanText } from "@/lib/api";
import { scoreStrategy } from "@/lib/search/scoring";
import { detectMisconceptions } from "@/lib/search/misconceptions";
import { ALL_STRATEGIES, type Strategy, type StrategyAnswer } from "@/lib/search/types";
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

  // Row level security already restricts this to sessions the instructor owns;
  // reading first also gives us the current timer state to work from.
  const { data } = await supabase.from("sessions").select("*").eq("id", id).maybeSingle();
  const session = data as SessionRow | null;
  if (!session) return fail("Session not found.", 404);

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
        const validation = validateProblem(body.problem as never);
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

  // Revealing results is also the moment we write a durable record of how each
  // answer scored, so the analysis survives later edits to the problem.
  if (body.action === "reveal") {
    await persistScores(supabase, updated as SessionRow);
  }

  return ok({ session: updated, serverNow: Date.now() });
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function persistScores(supabase: SupabaseLike, session: SessionRow) {
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
