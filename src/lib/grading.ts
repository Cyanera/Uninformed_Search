import type { StudentResult, StrategyResult } from "@/lib/analysis";

/**
 * Turning the search-order analysis into a mark.
 *
 * The activity measures a process, so the mark follows the process: every
 * enabled strategy is worth the same, and within a strategy a student earns
 * credit for each position of the expansion order they placed correctly. A
 * student who works BFS, DFS and UCS perfectly and slips once in IDS does not
 * lose a quarter of the mark for one mistake.
 *
 * Nothing here is stored in the database. The total is a property of how the
 * instructor chooses to weight the quiz, not of the submissions, so it can be
 * changed after the fact without re-marking anything.
 */

export interface StrategyMark {
  strategy: string;
  /** Marks earned for this strategy. */
  marks: number;
  /** Marks this strategy was worth. */
  outOf: number;
  /** Share of the expansion order placed correctly, 0..1. */
  accuracy: number;
  exact: boolean;
  answered: boolean;
}

export interface Grade {
  marks: number;
  outOf: number;
  /** marks / outOf, 0..1. */
  fraction: number;
  perStrategy: StrategyMark[];
  /** Strategies with a perfect expansion order. */
  exactCount: number;
}

/** Rounds to a quarter mark, which is how marks are usually written down. */
export function roundToQuarter(value: number): number {
  return Math.round(value * 4) / 4;
}

export const DEFAULT_TOTAL_MARKS = 5;

export function gradeStudent(result: StudentResult, totalMarks = DEFAULT_TOTAL_MARKS): Grade {
  const strategies = result.strategies;

  if (!strategies.length) {
    return { marks: 0, outOf: totalMarks, fraction: 0, perStrategy: [], exactCount: 0 };
  }

  const perStrategyTotal = totalMarks / strategies.length;

  const perStrategy: StrategyMark[] = strategies.map((entry: StrategyResult) => ({
    strategy: entry.strategy,
    // Partial credit by position, so a long correct prefix is worth something.
    marks: perStrategyTotal * entry.score.positionAccuracy,
    outOf: perStrategyTotal,
    accuracy: entry.score.positionAccuracy,
    exact: entry.score.exactMatch,
    answered: entry.score.answered,
  }));

  const raw = perStrategy.reduce((sum, s) => sum + s.marks, 0);
  const marks = roundToQuarter(raw);

  return {
    marks,
    outOf: totalMarks,
    fraction: totalMarks ? marks / totalMarks : 0,
    perStrategy,
    exactCount: perStrategy.filter((s) => s.exact).length,
  };
}

/** Formats a mark without a trailing ".00" on whole numbers. */
export function formatMarks(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "");
}

/* ------------------------------------------------------------------ export */

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * One row per student, with the mark, the per-strategy breakdown, and the
 * actual sequences — so the file is both a gradebook import and a record of
 * what each student wrote.
 */
export function resultsToCsv(
  results: StudentResult[],
  strategies: string[],
  totalMarks = DEFAULT_TOTAL_MARKS,
): string {
  const header = [
    "Student name",
    "Student ID",
    `Mark (out of ${totalMarks})`,
    "Percent",
    "Strategies exact",
    "Submitted at",
    "Late",
    "Completion (seconds)",
    ...strategies.flatMap((s) => [`${s} mark`, `${s} correct positions`, `${s} answer`, `${s} expected`]),
  ];

  const rows = results.map((result) => {
    const grade = gradeStudent(result, totalMarks);

    const strategyCells = strategies.flatMap((strategy) => {
      const entry = result.byStrategy[strategy];
      const mark = grade.perStrategy.find((m) => m.strategy === strategy);
      if (!entry) return ["", "", "", ""];
      return [
        mark ? formatMarks(roundToQuarter(mark.marks)) : "",
        `${entry.score.positionsCorrect}/${entry.score.positionsTotal}`,
        entry.score.actualFlat.join(" "),
        entry.score.expectedFlat.join(" "),
      ];
    });

    return [
      result.participant.name,
      result.participant.student_number,
      formatMarks(grade.marks),
      `${Math.round(grade.fraction * 100)}%`,
      String(grade.exactCount),
      result.finalSubmittedAt ? new Date(result.finalSubmittedAt).toLocaleString() : "",
      result.isLate ? "LATE" : "",
      result.completionSeconds === null ? "" : String(result.completionSeconds),
      ...strategyCells,
    ];
  });

  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}
