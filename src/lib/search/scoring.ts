import { canonicalAnswer } from "./algorithms";
import type {
  NodeId,
  StateSpaceProblem,
  Strategy,
  StrategyAnswer,
} from "./types";
import { isIterationsAnswer, isSequenceAnswer } from "./types";

/**
 * Scoring deliberately does NOT reduce to "right or wrong".
 *
 * A student who gets the first seven expansions right and then slips has
 * understood most of the algorithm; the instructor needs to see that, and needs
 * to see exactly WHERE the reasoning first left the rails.
 */

export interface SequenceScore {
  expected: NodeId[];
  actual: NodeId[];
  exactMatch: boolean;
  /** How many leading positions match before the first mistake. */
  correctPrefixLength: number;
  /** Positions i where actual[i] === expected[i]. */
  positionsCorrect: number;
  /** positionsCorrect / expected.length, 0..1. */
  positionAccuracy: number;
  /** 0-based index of the first mismatch, or null when the prefix is fully correct. */
  firstDivergenceIndex: number | null;
  expectedAtDivergence: NodeId | null;
  /** Null when the student's sequence simply ended early. */
  actualAtDivergence: NodeId | null;
  lengthDelta: number;
}

export function scoreSequence(expected: NodeId[], actual: NodeId[]): SequenceScore {
  let prefix = 0;
  while (prefix < expected.length && prefix < actual.length && expected[prefix] === actual[prefix]) {
    prefix++;
  }

  let positionsCorrect = 0;
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] === expected[i]) positionsCorrect++;
  }

  const exactMatch = expected.length === actual.length && prefix === expected.length;
  const diverged = !exactMatch;
  const firstDivergenceIndex = diverged ? prefix : null;

  return {
    expected,
    actual,
    exactMatch,
    correctPrefixLength: prefix,
    positionsCorrect,
    positionAccuracy: expected.length ? positionsCorrect / expected.length : 0,
    firstDivergenceIndex,
    expectedAtDivergence: firstDivergenceIndex !== null ? (expected[firstDivergenceIndex] ?? null) : null,
    actualAtDivergence: firstDivergenceIndex !== null ? (actual[firstDivergenceIndex] ?? null) : null,
    lengthDelta: actual.length - expected.length,
  };
}

export interface IterationScore extends SequenceScore {
  limit: number;
  /** False when the student never submitted an iteration at this limit. */
  present: boolean;
}

export interface StrategyScore {
  strategy: Strategy;
  answered: boolean;
  exactMatch: boolean;
  correctPrefixLength: number;
  positionsCorrect: number;
  positionsTotal: number;
  positionAccuracy: number;
  firstDivergenceIndex: number | null;
  expectedAtDivergence: NodeId | null;
  actualAtDivergence: NodeId | null;
  /** Flattened view, used by class-wide statistics. */
  expectedFlat: NodeId[];
  actualFlat: NodeId[];
  /** Per-iteration detail for IDS only. */
  iterations?: IterationScore[];
  iterationsExpectedCount?: number;
  iterationsCorrectCount?: number;
}

const EMPTY_ANSWER: StrategyScore["actualFlat"] = [];

/**
 * Score one strategy submission against the canonical answer derived from the
 * problem definition. The expected answer is computed, never looked up.
 */
export function scoreStrategy(
  problem: StateSpaceProblem,
  strategy: Strategy,
  answer: StrategyAnswer | null | undefined,
): StrategyScore {
  const expectedAnswer = canonicalAnswer(problem, strategy);

  if (strategy === "IDS") {
    const expectedIterations = isIterationsAnswer(expectedAnswer) ? expectedAnswer.iterations : [];
    const actualIterations = isIterationsAnswer(answer) ? answer.iterations : [];
    const answered = actualIterations.some((it) => it.sequence.length > 0);

    const iterations: IterationScore[] = expectedIterations.map((exp, i) => {
      const act = actualIterations.find((a) => a.limit === exp.limit) ?? actualIterations[i];
      const score = scoreSequence(exp.sequence, act?.sequence ?? []);
      return { ...score, limit: exp.limit, present: !!act };
    });

    // Extra iterations the student invented beyond the canonical count count as
    // wrong positions, so they cannot be ignored.
    const extraCount = Math.max(0, actualIterations.length - expectedIterations.length);

    const positionsTotal = iterations.reduce((n, it) => n + it.expected.length, 0);
    const positionsCorrect = iterations.reduce((n, it) => n + it.positionsCorrect, 0);
    const exactMatch =
      extraCount === 0 && iterations.length > 0 && iterations.every((it) => it.present && it.exactMatch);

    // First divergence across the concatenated iterations.
    const expectedFlat = expectedIterations.flatMap((it) => it.sequence);
    const actualFlat = actualIterations.flatMap((it) => it.sequence);
    const flat = scoreSequence(expectedFlat, actualFlat);

    return {
      strategy,
      answered,
      exactMatch,
      correctPrefixLength: flat.correctPrefixLength,
      positionsCorrect,
      positionsTotal,
      positionAccuracy: positionsTotal ? positionsCorrect / positionsTotal : 0,
      firstDivergenceIndex: exactMatch ? null : flat.firstDivergenceIndex,
      expectedAtDivergence: exactMatch ? null : flat.expectedAtDivergence,
      actualAtDivergence: exactMatch ? null : flat.actualAtDivergence,
      expectedFlat,
      actualFlat,
      iterations,
      iterationsExpectedCount: expectedIterations.length,
      iterationsCorrectCount: iterations.filter((it) => it.present && it.exactMatch).length,
    };
  }

  const expected = isSequenceAnswer(expectedAnswer) ? expectedAnswer.sequence : [];
  const actual = isSequenceAnswer(answer) ? answer.sequence : EMPTY_ANSWER;
  const score = scoreSequence(expected, actual);

  return {
    strategy,
    answered: actual.length > 0,
    exactMatch: score.exactMatch,
    correctPrefixLength: score.correctPrefixLength,
    positionsCorrect: score.positionsCorrect,
    positionsTotal: expected.length,
    positionAccuracy: score.positionAccuracy,
    firstDivergenceIndex: score.firstDivergenceIndex,
    expectedAtDivergence: score.expectedAtDivergence,
    actualAtDivergence: score.actualAtDivergence,
    expectedFlat: expected,
    actualFlat: actual,
  };
}

export type Verdict = "correct" | "partial" | "incorrect" | "missing";

/** Coarse label for the student x strategy matrix. */
export function verdictFor(score: StrategyScore): Verdict {
  if (!score.answered) return "missing";
  if (score.exactMatch) return "correct";
  if (score.positionAccuracy > 0 || score.correctPrefixLength > 0) return "partial";
  return "incorrect";
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  correct: "Correct",
  partial: "Partially correct",
  incorrect: "Incorrect",
  missing: "Not answered",
};

/** Overall activity score, weighting every enabled strategy equally. */
export function overallScore(scores: StrategyScore[]): {
  exactCount: number;
  total: number;
  averageAccuracy: number;
} {
  const total = scores.length;
  const exactCount = scores.filter((s) => s.exactMatch).length;
  const averageAccuracy = total ? scores.reduce((n, s) => n + s.positionAccuracy, 0) / total : 0;
  return { exactCount, total, averageAccuracy };
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
