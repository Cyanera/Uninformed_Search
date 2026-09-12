import { breadthFirstSearch, depthFirstSearch, runStrategy, uniformCostSearch } from "./algorithms";
import { childrenOf } from "./problem";
import type { FrontierEntry, NodeId, StateSpaceProblem, Strategy } from "./types";

/**
 * "Wrong on purpose" reference runs.
 *
 * Each function simulates a specific, well-known student misconception so the
 * dashboard can compare a submission against the *mistake* rather than pattern
 * matching on strings. That keeps misconception detection honest when the
 * instructor edits the graph.
 */

/**
 * What the search order looks like if the goal test is applied when the goal is
 * GENERATED instead of when it is removed from the frontier — the classic UCS
 * error, which also shortens BFS and DFS.
 *
 * Returns null when it is indistinguishable from the correct answer (i.e. the
 * goal is expanded immediately after being generated).
 */
export function goalOnGenerationOrder(problem: StateSpaceProblem, strategy: Strategy): NodeId[] | null {
  if (strategy === "IDS") return null;
  const run = runStrategy(problem, strategy);
  const step = run.steps.find((s) => s.generated.some((c) => c.node === problem.goal));
  if (!step) return null;
  const order = [...step.processedSoFar, problem.goal];
  return sameOrder(order, run.order) ? null : order;
}

/**
 * UCS done with the wrong priority: the student compares the single edge cost
 * to reach a node instead of the cumulative path cost g(n).
 *
 * Returns null when it coincides with correct UCS on this graph — in which case
 * the misconception is simply not observable here and must not be reported.
 */
export function greedyEdgeCostOrder(problem: StateSpaceProblem): NodeId[] | null {
  const processed: NodeId[] = [];
  let seq = 1;
  const frontier: (FrontierEntry & { priority: number })[] = [
    { node: problem.start, g: 0, depth: 0, path: [problem.start], seq: 0, priority: 0 },
  ];

  let guard = 0;
  while (frontier.length && guard++ < 500) {
    frontier.sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : a.seq - b.seq));
    const current = frontier.shift()!;
    processed.push(current.node);
    if (current.node === problem.goal) break;
    for (const edge of childrenOf(problem, current.node)) {
      frontier.push({
        node: edge.to,
        g: current.g + edge.cost,
        depth: current.depth + 1,
        path: [...current.path, edge.to],
        seq: seq++,
        priority: edge.cost, // the mistake: step cost, not cumulative cost
      });
    }
  }

  const correct = uniformCostSearch(problem).order;
  return sameOrder(processed, correct) ? null : processed;
}

/**
 * Iterative deepening done without restarting: each iteration continues from
 * where the last one stopped, so only the newly reachable depth is listed.
 */
export function idsWithoutRestartIterations(
  problem: StateSpaceProblem,
): { limit: number; sequence: NodeId[] }[] {
  const correct = runStrategy(problem, "IDS").iterations ?? [];
  const seen = new Set<NodeId>();
  return correct.map((it) => {
    const fresh = it.sequence.filter((n) => !seen.has(n));
    fresh.forEach((n) => seen.add(n));
    return { limit: it.limit, sequence: fresh };
  });
}

/** The solution path — what students submit when they answer the wrong question. */
export function solutionPathFor(problem: StateSpaceProblem, strategy: Strategy): NodeId[] | null {
  return runStrategy(problem, strategy).solutionPath;
}

/** BFS order, used to detect a student answering DFS breadth-first. */
export function bfsOrder(problem: StateSpaceProblem): NodeId[] {
  return breadthFirstSearch(problem).order;
}

/** DFS order, used to detect a student answering BFS depth-first. */
export function dfsOrder(problem: StateSpaceProblem): NodeId[] {
  return depthFirstSearch(problem, { depthLimit: null }).order;
}

export function sameOrder(a: NodeId[], b: NodeId[]): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** Fraction of positions of `reference` that `actual` reproduces, 0..1. */
export function similarity(reference: NodeId[], actual: NodeId[]): number {
  if (!reference.length) return 0;
  let hits = 0;
  for (let i = 0; i < reference.length; i++) if (actual[i] === reference[i]) hits++;
  // Penalise a wildly different length so a long guess cannot score well.
  const lengthPenalty = 1 - Math.min(1, Math.abs(actual.length - reference.length) / reference.length);
  return (hits / reference.length) * (0.7 + 0.3 * lengthPenalty);
}
