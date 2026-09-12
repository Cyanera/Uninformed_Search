import { describe, expect, it } from "vitest";
import { buildClassStats, buildResults } from "@/lib/analysis";
import { CAMPUS_DELIVERY_ROBOT } from "@/lib/search/problem";
import type { ParticipantRow, PublicSession, SubmissionRow } from "@/lib/types";
import type { Strategy, StrategyAnswer } from "@/lib/search/types";

const BFS = ["S", "A", "B", "C", "D", "E", "F", "H", "G"];
const DFS = ["S", "A", "D", "E", "B", "F", "C", "H", "G"];
const UCS = ["S", "B", "F", "A", "D", "E", "C", "H", "G"];
const IDS: StrategyAnswer = {
  iterations: [
    { limit: 0, sequence: ["S"] },
    { limit: 1, sequence: ["S", "A", "B", "C"] },
    { limit: 2, sequence: DFS },
  ],
};

const START = "2026-03-01T10:00:00.000Z";

const session: PublicSession = {
  id: "sess",
  code: "ABCDE",
  title: "Activity",
  problem: CAMPUS_DELIVERY_ROBOT,
  strategies: ["BFS", "DFS", "IDS", "UCS"],
  durationSeconds: 900,
  status: "ended",
  startedAt: START,
  pausedAt: null,
  accumulatedPauseSeconds: 0,
  allowLate: false,
  revealResults: true,
};

let counter = 0;

function student(
  name: string,
  answers: Partial<Record<Strategy, StrategyAnswer | null>>,
  options: { finishedAfterSeconds?: number; late?: boolean; draftOnly?: Strategy[] } = {},
): { participant: ParticipantRow; submissions: SubmissionRow[] } {
  const id = `p${++counter}`;
  const finishedAt = options.finishedAfterSeconds
    ? new Date(Date.parse(START) + options.finishedAfterSeconds * 1000).toISOString()
    : null;

  const participant: ParticipantRow = {
    id,
    session_id: session.id,
    name,
    student_number: `S${id}`,
    joined_at: START,
    last_seen_at: START,
    final_submitted_at: finishedAt,
    is_late: options.late ?? false,
  };

  const submissions: SubmissionRow[] = Object.entries(answers)
    .filter(([, answer]) => answer !== null)
    .map(([strategy, answer], i) => ({
      id: `${id}-${i}`,
      session_id: session.id,
      participant_id: id,
      strategy: strategy as Strategy,
      answer_json: answer as StrategyAnswer,
      status: options.draftOnly?.includes(strategy as Strategy) ? "in_progress" : "submitted",
      submitted_at: finishedAt,
      updated_at: START,
      is_late: options.late ?? false,
      score_data_json: null,
    }));

  return { participant, submissions };
}

describe("buildResults", () => {
  it("marks a perfect submission as exact on every strategy", () => {
    const s = student("Perfect", {
      BFS: { sequence: BFS },
      DFS: { sequence: DFS },
      UCS: { sequence: UCS },
      IDS,
    }, { finishedAfterSeconds: 300 });

    const [result] = buildResults(session, [s.participant], s.submissions);
    expect(result.exactCount).toBe(4);
    expect(result.averageAccuracy).toBe(1);
    expect(result.submittedCount).toBe(4);
    expect(result.strategies.every((x) => x.verdict === "correct")).toBe(true);
  });

  it("measures completion time from the instructor pressing Start", () => {
    const s = student("Timed", { BFS: { sequence: BFS } }, { finishedAfterSeconds: 425 });
    const [result] = buildResults(session, [s.participant], s.submissions);
    expect(result.completionSeconds).toBe(425);
  });

  it("reports no completion time for a student who never finished", () => {
    const s = student("Unfinished", { BFS: { sequence: BFS } });
    const [result] = buildResults(session, [s.participant], s.submissions);
    expect(result.completionSeconds).toBeNull();
  });

  it("separates 'not started' from 'in progress' from 'submitted'", () => {
    const s = student(
      "Partial",
      { BFS: { sequence: BFS }, DFS: { sequence: ["S", "A"] }, UCS: { sequence: [] } },
      { draftOnly: ["DFS", "UCS"] },
    );
    const [result] = buildResults(session, [s.participant], s.submissions);
    expect(result.byStrategy.BFS.status).toBe("submitted");
    expect(result.byStrategy.DFS.status).toBe("in_progress");
    // An empty draft row is still "not started" as far as the board is concerned.
    expect(result.byStrategy.UCS.status).toBe("not_started");
    expect(result.byStrategy.IDS.status).toBe("not_started");
    expect(result.submittedCount).toBe(1);
  });

  it("surfaces the first divergence for the instructor", () => {
    const s = student("Slipped", { UCS: { sequence: ["S", "B", "F", "A", "D", "E", "C", "G", "H"] } });
    const [result] = buildResults(session, [s.participant], s.submissions);
    const ucs = result.byStrategy.UCS;
    expect(ucs.score.exactMatch).toBe(false);
    expect(ucs.score.correctPrefixLength).toBe(7);
    expect(ucs.score.firstDivergenceIndex).toBe(7);
    expect(ucs.score.expectedAtDivergence).toBe("H");
    expect(ucs.score.actualAtDivergence).toBe("G");
  });

  it("attaches misconceptions to the right strategy only", () => {
    const s = student("Confused", { BFS: { sequence: DFS }, DFS: { sequence: DFS } });
    const [result] = buildResults(session, [s.participant], s.submissions);
    expect(result.byStrategy.BFS.misconceptions.map((m) => m.code)).toContain("bfs-behaves-like-dfs");
    expect(result.byStrategy.DFS.misconceptions).toEqual([]);
  });
});

describe("buildClassStats", () => {
  const cohort = [
    student("Amal", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS }, IDS }, { finishedAfterSeconds: 240 }),
    student("Basma", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS }, IDS }, { finishedAfterSeconds: 480 }),
    // Stops as soon as G is generated — the classic UCS error.
    student("Dana", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: ["S", "B", "F", "A", "D", "E", "C", "G"] }, IDS }, { finishedAfterSeconds: 600 }),
    // Answers BFS depth-first.
    student("Hana", { BFS: { sequence: DFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS } }, { finishedAfterSeconds: 900 }),
  ];

  const participants = cohort.map((c) => c.participant);
  const submissions = cohort.flatMap((c) => c.submissions);
  const results = buildResults(session, participants, submissions);
  const stats = buildClassStats(session, results);

  const forStrategy = (s: Strategy) => stats.byStrategy.find((x) => x.strategy === s)!;

  it("counts the cohort", () => {
    expect(stats.students).toBe(4);
    expect(stats.fullyCorrect).toBe(2);
  });

  it("reports accuracy and exact-match rate per strategy", () => {
    expect(forStrategy("DFS").exactRate).toBe(1);
    expect(forStrategy("DFS").accuracy).toBe(1);
    expect(forStrategy("BFS").exactMatches).toBe(3);
    expect(forStrategy("BFS").answered).toBe(4);
    expect(forStrategy("BFS").exactRate).toBeCloseTo(0.75, 5);
  });

  it("only counts students who actually answered", () => {
    // Hana never answered IDS.
    expect(forStrategy("IDS").answered).toBe(3);
    expect(forStrategy("IDS").exactRate).toBe(1);
  });

  it("rewards a long correct prefix", () => {
    // Dana is right for 7 of 9 UCS steps; the other three are perfect.
    expect(forStrategy("UCS").averagePrefixLength).toBeCloseTo((9 + 9 + 7 + 9) / 4, 5);
  });

  it("identifies where the class first went wrong", () => {
    const ucs = forStrategy("UCS");
    expect(ucs.firstErrors[0].afterNode).toBe("C");
    expect(ucs.firstErrors[0].index).toBe(7);
    expect(ucs.firstErrors[0].count).toBe(1);
    expect(ucs.firstErrors[0].share).toBe(1); // of everyone who diverged
  });

  it("identifies the most common wrong node at the worst step", () => {
    const ucs = forStrategy("UCS");
    expect(ucs.worstPosition!.index).toBe(7);
    expect(ucs.worstPosition!.expected).toBe("H");
    expect(ucs.worstPosition!.wrong[0].node).toBe("G");
  });

  it("records a missing answer as wrong at that position, not as absent", () => {
    const ucs = forStrategy("UCS");
    expect(ucs.positions[8].wrong.find((w) => w.node === "(nothing)")?.count).toBe(1);
  });

  it("aggregates misconceptions across the class", () => {
    expect(forStrategy("BFS").misconceptions.map((m) => m.code)).toContain("bfs-behaves-like-dfs");
    expect(forStrategy("UCS").misconceptions.map((m) => m.code)).toContain("goal-test-on-generation");
    expect(forStrategy("DFS").misconceptions).toEqual([]);
  });

  it("summarises completion time", () => {
    expect(stats.completion.count).toBe(4);
    expect(stats.completion.fastestSeconds).toBe(240);
    expect(stats.completion.slowestSeconds).toBe(900);
    expect(stats.completion.averageSeconds).toBe(555);
    expect(stats.completion.medianSeconds).toBe(540);
    expect(stats.completion.buckets.reduce((n, b) => n + b.count, 0)).toBe(4);
  });

  it("survives an empty class without dividing by zero", () => {
    const empty = buildClassStats(session, []);
    expect(empty.students).toBe(0);
    expect(empty.fullyCorrect).toBe(0);
    expect(empty.completion.averageSeconds).toBeNull();
    for (const s of empty.byStrategy) {
      expect(s.accuracy).toBe(0);
      expect(s.exactRate).toBe(0);
      expect(s.firstErrors).toEqual([]);
    }
  });
});
