import { scoreStrategy, verdictFor, overallScore, type StrategyScore, type Verdict } from "@/lib/search/scoring";
import { detectMisconceptions, type Misconception } from "@/lib/search/misconceptions";
import { canonicalAnswer } from "@/lib/search/algorithms";
import { isSequenceAnswer, type NodeId, type Strategy, type StrategyAnswer } from "@/lib/search/types";
import type { ParticipantRow, PublicSession, SubmissionRow } from "@/lib/types";

/**
 * Turns the raw roster into everything the dashboard needs.
 *
 * All of it is derived: canonical answers come from running the engine on the
 * session's frozen problem, so an instructor who edits the graph for the next
 * class never invalidates what is on screen for this one.
 */

export type CellStatus = "not_started" | "in_progress" | "submitted";

export const CELL_STATUS_LABEL: Record<CellStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  submitted: "Submitted",
};

export interface StrategyResult {
  strategy: Strategy;
  submission: SubmissionRow | null;
  status: CellStatus;
  score: StrategyScore;
  verdict: Verdict;
  misconceptions: Misconception[];
  isLate: boolean;
}

export interface StudentResult {
  participant: ParticipantRow;
  strategies: StrategyResult[];
  byStrategy: Record<string, StrategyResult>;
  submittedCount: number;
  exactCount: number;
  averageAccuracy: number;
  finalSubmittedAt: string | null;
  /** Seconds from the instructor pressing Start to the final submission. */
  completionSeconds: number | null;
  isLate: boolean;
}

function answerOf(submission: SubmissionRow | null): StrategyAnswer | null {
  return submission ? (submission.answer_json as StrategyAnswer) : null;
}

function statusOf(submission: SubmissionRow | null): CellStatus {
  if (!submission) return "not_started";
  if (submission.status === "submitted") return "submitted";
  const a = submission.answer_json as StrategyAnswer;
  const empty = "sequence" in a ? !a.sequence.length : a.iterations.every((i) => !i.sequence.length);
  return empty ? "not_started" : "in_progress";
}

export function buildResults(
  session: PublicSession,
  participants: ParticipantRow[],
  submissions: SubmissionRow[],
): StudentResult[] {
  const startedMs = session.startedAt ? Date.parse(session.startedAt) : null;

  return participants.map((participant) => {
    const mine = submissions.filter((s) => s.participant_id === participant.id);

    const strategies: StrategyResult[] = session.strategies.map((strategy) => {
      const submission = mine.find((s) => s.strategy === strategy) ?? null;
      const answer = answerOf(submission);
      const score = scoreStrategy(session.problem, strategy, answer);
      return {
        strategy,
        submission,
        status: statusOf(submission),
        score,
        verdict: verdictFor(score),
        misconceptions: detectMisconceptions(session.problem, strategy, answer),
        isLate: submission?.is_late ?? false,
      };
    });

    const byStrategy: Record<string, StrategyResult> = {};
    for (const s of strategies) byStrategy[s.strategy] = s;

    const overall = overallScore(strategies.map((s) => s.score));
    const finalAt = participant.final_submitted_at;

    return {
      participant,
      strategies,
      byStrategy,
      submittedCount: strategies.filter((s) => s.status === "submitted").length,
      exactCount: overall.exactCount,
      averageAccuracy: overall.averageAccuracy,
      finalSubmittedAt: finalAt,
      completionSeconds:
        finalAt && startedMs ? Math.max(0, Math.round((Date.parse(finalAt) - startedMs) / 1000)) : null,
      isLate: participant.is_late,
    };
  });
}

/* ------------------------------- class stats ----------------------------- */

export interface PositionStat {
  /** 0-based position in the canonical sequence. */
  index: number;
  expected: NodeId;
  attempts: number;
  correct: number;
  /** Wrong answers at this position, most common first. */
  wrong: { node: NodeId | "(nothing)"; count: number }[];
}

export interface FirstErrorStat {
  /** The node processed immediately before the first mistake, or "(the start)". */
  afterNode: string;
  index: number;
  count: number;
  share: number;
}

export interface StrategyStats {
  strategy: Strategy;
  answered: number;
  /** Mean per-position accuracy across everyone who answered. */
  accuracy: number;
  exactMatches: number;
  exactRate: number;
  averagePrefixLength: number;
  expectedLength: number;
  positions: PositionStat[];
  firstErrors: FirstErrorStat[];
  /** The position where most students went wrong. */
  worstPosition: PositionStat | null;
  misconceptions: { code: string; title: string; count: number; share: number }[];
}

export interface CompletionStats {
  count: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  fastestSeconds: number | null;
  slowestSeconds: number | null;
  /** Fixed-width buckets for a simple distribution bar chart. */
  buckets: { label: string; from: number; to: number; count: number }[];
}

export interface ClassStats {
  students: number;
  byStrategy: StrategyStats[];
  completion: CompletionStats;
  fullyCorrect: number;
}

function flattenExpected(session: PublicSession, strategy: Strategy): NodeId[] {
  const canonical = canonicalAnswer(session.problem, strategy);
  return isSequenceAnswer(canonical) ? canonical.sequence : canonical.iterations.flatMap((i) => i.sequence);
}

export function buildClassStats(session: PublicSession, results: StudentResult[]): ClassStats {
  const byStrategy = session.strategies.map((strategy) => {
    const expected = flattenExpected(session, strategy);
    const entries = results
      .map((r) => r.byStrategy[strategy])
      .filter((s): s is StrategyResult => !!s && s.score.answered);

    const positions: PositionStat[] = expected.map((node, index) => {
      const wrongCounts = new Map<string, number>();
      let correct = 0;
      for (const entry of entries) {
        const actual = entry.score.actualFlat[index];
        if (actual === node) correct++;
        else {
          const key = actual ?? "(nothing)";
          wrongCounts.set(key, (wrongCounts.get(key) ?? 0) + 1);
        }
      }
      return {
        index,
        expected: node,
        attempts: entries.length,
        correct,
        wrong: [...wrongCounts.entries()]
          .map(([n, count]) => ({ node: n as NodeId | "(nothing)", count }))
          .sort((a, b) => b.count - a.count),
      };
    });

    // Where did each student's reasoning first leave the rails?
    const firstErrorCounts = new Map<string, { index: number; count: number }>();
    for (const entry of entries) {
      const i = entry.score.firstDivergenceIndex;
      if (i === null) continue;
      const afterNode = i > 0 ? expected[i - 1] : "(the start)";
      const key = `${afterNode}@${i}`;
      const current = firstErrorCounts.get(key) ?? { index: i, count: 0 };
      current.count++;
      firstErrorCounts.set(key, current);
    }

    const diverged = entries.filter((e) => e.score.firstDivergenceIndex !== null).length;
    const firstErrors: FirstErrorStat[] = [...firstErrorCounts.entries()]
      .map(([key, v]) => ({
        afterNode: key.split("@")[0],
        index: v.index,
        count: v.count,
        share: diverged ? v.count / diverged : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const misconceptionCounts = new Map<string, { title: string; count: number }>();
    for (const entry of entries) {
      for (const m of entry.misconceptions) {
        const current = misconceptionCounts.get(m.code) ?? { title: m.title, count: 0 };
        current.count++;
        misconceptionCounts.set(m.code, current);
      }
    }

    const exactMatches = entries.filter((e) => e.score.exactMatch).length;
    const worst = positions
      .filter((p) => p.attempts > 0 && p.correct < p.attempts)
      .sort((a, b) => a.correct / a.attempts - b.correct / b.attempts || a.index - b.index)[0];

    return {
      strategy,
      answered: entries.length,
      accuracy: entries.length ? entries.reduce((n, e) => n + e.score.positionAccuracy, 0) / entries.length : 0,
      exactMatches,
      exactRate: entries.length ? exactMatches / entries.length : 0,
      averagePrefixLength: entries.length
        ? entries.reduce((n, e) => n + e.score.correctPrefixLength, 0) / entries.length
        : 0,
      expectedLength: expected.length,
      positions,
      firstErrors,
      worstPosition: worst ?? null,
      misconceptions: [...misconceptionCounts.entries()]
        .map(([code, v]) => ({
          code,
          title: v.title,
          count: v.count,
          share: entries.length ? v.count / entries.length : 0,
        }))
        .sort((a, b) => b.count - a.count),
    } satisfies StrategyStats;
  });

  const times = results
    .map((r) => r.completionSeconds)
    .filter((t): t is number => typeof t === "number")
    .sort((a, b) => a - b);

  const median =
    times.length === 0
      ? null
      : times.length % 2
        ? times[(times.length - 1) / 2]
        : Math.round((times[times.length / 2 - 1] + times[times.length / 2]) / 2);

  const buckets = buildBuckets(times, session.durationSeconds);

  return {
    students: results.length,
    byStrategy,
    completion: {
      count: times.length,
      averageSeconds: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
      medianSeconds: median,
      fastestSeconds: times[0] ?? null,
      slowestSeconds: times.at(-1) ?? null,
      buckets,
    },
    fullyCorrect: results.filter(
      (r) => r.strategies.length > 0 && r.strategies.every((s) => s.score.exactMatch),
    ).length,
  };
}

function buildBuckets(times: number[], durationSeconds: number) {
  const bucketCount = 6;
  const span = Math.max(60, Math.ceil(durationSeconds / bucketCount));
  const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    label: `${Math.round((i * span) / 60)}–${Math.round(((i + 1) * span) / 60)} min`,
    from: i * span,
    to: (i + 1) * span,
    count: 0,
  }));
  for (const t of times) {
    const i = Math.min(bucketCount - 1, Math.floor(t / span));
    buckets[i].count++;
  }
  return buckets;
}
