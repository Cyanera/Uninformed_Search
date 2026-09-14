import { describe, expect, it } from "vitest";
import { gradeStudent, resultsToCsv, roundToQuarter, formatMarks } from "@/lib/grading";
import { buildResults } from "@/lib/analysis";
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
  id: "s", code: "ABCDE", title: "Quiz", problem: CAMPUS_DELIVERY_ROBOT,
  strategies: ["BFS", "DFS", "IDS", "UCS"], durationSeconds: 900, status: "ended",
  startedAt: START, pausedAt: null, accumulatedPauseSeconds: 0, allowLate: false, revealResults: true,
};

let n = 0;
function student(name: string, answers: Partial<Record<Strategy, StrategyAnswer>>, late = false) {
  const id = `p${++n}`;
  const participant: ParticipantRow = {
    id, session_id: "s", name, student_number: `S${id}`, joined_at: START, last_seen_at: START,
    final_submitted_at: new Date(Date.parse(START) + 300_000).toISOString(), is_late: late,
  };
  const submissions: SubmissionRow[] = Object.entries(answers).map(([strategy, answer], i) => ({
    id: `${id}-${i}`, session_id: "s", participant_id: id, strategy: strategy as Strategy,
    answer_json: answer as StrategyAnswer, status: "submitted", submitted_at: START,
    updated_at: START, is_late: late, score_data_json: null,
  }));
  return buildResults(session, [participant], submissions)[0];
}

describe("gradeStudent", () => {
  it("gives full marks for a perfect paper", () => {
    const g = gradeStudent(student("Perfect", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS }, IDS }), 5);
    expect(g.marks).toBe(5);
    expect(g.outOf).toBe(5);
    expect(g.exactCount).toBe(4);
  });

  it("gives zero for nothing submitted", () => {
    expect(gradeStudent(student("Absent", {}), 5).marks).toBe(0);
  });

  it("weights every strategy equally", () => {
    // Three of four perfect, one missing => 3/4 of the marks.
    const g = gradeStudent(student("ThreeOfFour", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS } }), 5);
    expect(g.marks).toBe(3.75);
    for (const s of g.perStrategy) expect(s.outOf).toBe(1.25);
  });

  it("gives partial credit rather than all-or-nothing", () => {
    // UCS with the last two swapped: 7 of 9 positions right.
    const nearly = ["S", "B", "F", "A", "D", "E", "C", "G", "H"];
    const g = gradeStudent(student("Slipped", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: nearly }, IDS }), 5);
    expect(g.marks).toBeGreaterThan(4.5);
    expect(g.marks).toBeLessThan(5);
    expect(g.exactCount).toBe(3);
  });

  it("does not reward a wholly wrong answer", () => {
    const g = gradeStudent(student("Wrong", { BFS: { sequence: ["G", "H", "F"] } }), 5);
    expect(g.marks).toBe(0);
  });

  it("scales to any total the instructor sets", () => {
    const perfect = { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS }, IDS };
    expect(gradeStudent(student("A", perfect), 10).marks).toBe(10);
    expect(gradeStudent(student("B", perfect), 20).marks).toBe(20);
    expect(gradeStudent(student("C", perfect), 1).marks).toBe(1);
  });

  it("never exceeds the total or goes negative", () => {
    for (const answers of [
      { BFS: { sequence: [...BFS, "S", "S"] } },
      { BFS: { sequence: [] } },
      { UCS: { sequence: ["S"] } },
    ]) {
      const g = gradeStudent(student(`Edge${Math.random()}`, answers), 5);
      expect(g.marks).toBeGreaterThanOrEqual(0);
      expect(g.marks).toBeLessThanOrEqual(5);
    }
  });

  it("rounds to quarter marks", () => {
    expect(roundToQuarter(3.3)).toBe(3.25);
    expect(roundToQuarter(3.4)).toBe(3.5);
    expect(roundToQuarter(4.99)).toBe(5);
    expect(formatMarks(3.5)).toBe("3.5");
    expect(formatMarks(4)).toBe("4");
  });
});

describe("resultsToCsv", () => {
  const results = [
    student("Norah Al-Harbi", { BFS: { sequence: BFS }, DFS: { sequence: DFS }, UCS: { sequence: UCS }, IDS }),
    student("Sara, with a comma", { BFS: { sequence: BFS } }),
  ];
  const csv = resultsToCsv(results, session.strategies, 5);
  const lines = csv.split("\n");

  it("has a header and one row per student", () => {
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("Mark (out of 5)");
    expect(lines[0]).toContain("BFS answer");
  });

  it("quotes a field containing a comma, so the file does not shift", () => {
    expect(lines[2]).toContain('"Sara, with a comma"');
    expect(lines[2].split('","').length).toBeGreaterThan(0);
  });

  it("records the mark and the actual sequence", () => {
    expect(lines[1]).toContain("5");
    expect(lines[1]).toContain("S A B C D E F H G");
  });

  it("includes the expected answer beside the student's", () => {
    expect(lines[0]).toContain("BFS expected");
    expect(lines[1]).toContain(BFS.join(" "));
  });
});
