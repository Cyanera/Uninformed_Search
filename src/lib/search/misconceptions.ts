import { canonicalAnswer } from "./algorithms";
import {
  bfsOrder,
  dfsOrder,
  goalOnGenerationOrder,
  greedyEdgeCostOrder,
  idsWithoutRestartIterations,
  sameOrder,
  similarity,
  solutionPathFor,
} from "./references";
import type { NodeId, StateSpaceProblem, Strategy, StrategyAnswer } from "./types";
import { isIterationsAnswer, isSequenceAnswer } from "./types";

/**
 * Rule-based misconception detection. No AI, no external calls.
 *
 * Every finding is phrased as a POSSIBILITY, because a pattern match is
 * evidence, not a diagnosis. These strings are shown to the instructor only.
 */

export type Confidence = "likely" | "possible";

export interface Misconception {
  strategy: Strategy;
  /** Stable id, used to aggregate across the class. */
  code: string;
  title: string;
  detail: string;
  confidence: Confidence;
}

/** A reference run has to beat the canonical answer by this much to be reported. */
const MARGIN = 0.15;

function flatten(answer: StrategyAnswer | null | undefined): NodeId[] {
  if (isSequenceAnswer(answer)) return answer.sequence;
  if (isIterationsAnswer(answer)) return answer.iterations.flatMap((i) => i.sequence);
  return [];
}

function canonicalFlat(problem: StateSpaceProblem, strategy: Strategy): NodeId[] {
  return flatten(canonicalAnswer(problem, strategy) as StrategyAnswer);
}

/**
 * Report a misconception when the student's answer matches the "wrong" run
 * better than it matches the correct one.
 */
function compare(
  actual: NodeId[],
  reference: NodeId[] | null,
  correct: NodeId[],
): Confidence | null {
  if (!reference || !reference.length || !actual.length) return null;
  if (sameOrder(actual, correct)) return null;
  if (sameOrder(actual, reference)) return "likely";
  const refScore = similarity(reference, actual);
  const correctScore = similarity(correct, actual);
  if (refScore > correctScore + MARGIN && refScore >= 0.6) return "possible";
  return null;
}

export function detectMisconceptions(
  problem: StateSpaceProblem,
  strategy: Strategy,
  answer: StrategyAnswer | null | undefined,
): Misconception[] {
  const found: Misconception[] = [];
  const actual = flatten(answer);
  if (!actual.length) return found;

  const correct = canonicalFlat(problem, strategy);
  const push = (code: string, title: string, detail: string, confidence: Confidence) =>
    found.push({ strategy, code, title, detail, confidence });

  /* --- answering the wrong question altogether ------------------------- */

  const path = solutionPathFor(problem, strategy);
  if (path && path.length && sameOrder(actual, path) && !sameOrder(actual, correct)) {
    push(
      "solution-path-not-search-order",
      "Submitted the solution path, not the search order",
      `The answer is exactly the final path ${path.join(" → ")}. The activity asks for every node removed from the frontier, including nodes that were explored and abandoned.`,
      "likely",
    );
  }

  if (!actual.includes(problem.goal) && actual.length >= 2) {
    push(
      "goal-missing",
      "Goal node is missing from the sequence",
      `The goal ${problem.goal} never appears. The goal is goal-tested when it is removed from the frontier, so it belongs in the recorded order.`,
      "likely",
    );
  }

  /* --- strategy confusion ---------------------------------------------- */

  if (strategy === "BFS") {
    const c = compare(actual, dfsOrder(problem), correct);
    if (c) {
      push(
        "bfs-behaves-like-dfs",
        "May be using a stack / depth-first ordering instead of FIFO",
        "The sequence follows one branch to the bottom before moving sideways. Breadth-first search removes from the FRONT of a FIFO queue, so the whole of one level is processed before the next level begins.",
        c,
      );
    }
  }

  if (strategy === "DFS") {
    const c = compare(actual, bfsOrder(problem), correct);
    if (c) {
      push(
        "dfs-behaves-like-bfs",
        "May be expanding level by level instead of following one branch",
        "The sequence sweeps each depth in turn. Depth-first search removes from the TOP of a LIFO stack, so it commits to the leftmost child and only backtracks when that branch is exhausted.",
        c,
      );
    }
  }

  /* --- goal test on generation ----------------------------------------- */

  const earlyStop = goalOnGenerationOrder(problem, strategy);
  const earlyStopConfidence = compare(actual, earlyStop, correct);
  if (earlyStopConfidence) {
    push(
      "goal-test-on-generation",
      "May be applying the goal test on generation instead of expansion",
      `The sequence stops as soon as ${problem.goal} is first generated as a child, skipping the nodes that are still ahead of it in the frontier. The goal test is applied when a node is REMOVED from the frontier.`,
      earlyStopConfidence,
    );
  }

  /* --- UCS specific ----------------------------------------------------- */

  if (strategy === "UCS") {
    const greedy = greedyEdgeCostOrder(problem);
    const c = compare(actual, greedy, correct);
    if (c) {
      push(
        "ucs-step-cost-not-cumulative",
        "May be comparing step cost instead of cumulative path cost",
        "The chosen node at each step is the one with the cheapest single EDGE, not the one with the smallest cumulative g(n). Uniform-cost search prioritises g(n) = cost of the whole path from the start.",
        c,
      );
    }
  }

  /* --- IDS specific ----------------------------------------------------- */

  if (strategy === "IDS" && isIterationsAnswer(answer)) {
    const iterations = answer.iterations.filter((it) => it.sequence.length > 0);
    const expected = (canonicalAnswer(problem, "IDS") as { iterations: { limit: number; sequence: NodeId[] }[] })
      .iterations;

    const notRestarting = iterations.filter((it, i) => i > 0 && it.sequence[0] !== problem.start);
    if (notRestarting.length) {
      push(
        "ids-no-restart",
        "May be continuing from the previous depth instead of restarting DFS",
        `Iteration${notRestarting.length > 1 ? "s" : ""} ${notRestarting
          .map((it) => `L=${it.limit}`)
          .join(", ")} do not begin at ${problem.start}. Each depth limit restarts a brand new depth-limited search from the start node.`,
        "likely",
      );
    } else {
      const c = compare(
        iterations.flatMap((i) => i.sequence),
        idsWithoutRestartIterations(problem).flatMap((i) => i.sequence),
        correct,
      );
      if (c) {
        push(
          "ids-no-restart",
          "May be continuing from the previous depth instead of restarting DFS",
          "Each iteration appears to list only the newly reached depth. Iterative deepening throws the previous search away and starts again from the start node at every limit.",
          c,
        );
      }
    }

    const flat = iterations.flatMap((i) => i.sequence);
    if (flat.length > 1 && new Set(flat).size === flat.length && expected.length > 1) {
      push(
        "ids-deduplicated",
        "May not understand that upper levels are revisited in each IDS iteration",
        `No node appears twice across the iterations. In iterative deepening the upper levels are searched again at every new limit, so ${problem.start} alone should appear ${expected.length} times.`,
        "likely",
      );
    }

    if (iterations.length === 1 && expected.length > 1) {
      push(
        "ids-single-iteration",
        "May have run one depth-limited search instead of iterating",
        `Only one depth limit was submitted, but the goal is first reached at L=${expected.at(-1)!.limit}, so the search runs ${expected.length} iterations (L=${expected.map((e) => e.limit).join(", L=")}).`,
        "likely",
      );
    }

    const overshoot = iterations.filter((it) => {
      const exp = expected.find((e) => e.limit === it.limit);
      return exp && it.sequence.length > exp.sequence.length;
    });
    if (overshoot.length && !notRestarting.length) {
      push(
        "ids-ignores-cutoff",
        "May be expanding nodes that sit at the depth limit",
        `Iteration${overshoot.length > 1 ? "s" : ""} ${overshoot
          .map((it) => `L=${it.limit}`)
          .join(", ")} contain more nodes than the limit allows. A node AT the limit is still goal-tested, but its children are never generated.`,
        "possible",
      );
    }
  }

  // Deduplicate by code, keeping the strongest confidence.
  const byCode = new Map<string, Misconception>();
  for (const m of found) {
    const existing = byCode.get(m.code);
    if (!existing || (existing.confidence === "possible" && m.confidence === "likely")) {
      byCode.set(m.code, m);
    }
  }
  return [...byCode.values()];
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  likely: "Possible misconception",
  possible: "Possible misconception (weaker signal)",
};
