import { childrenOf } from "./problem";
import type {
  StrategyAnswer,
  FrontierEntry,
  GeneratedChild,
  IdsIteration,
  NodeId,
  SearchResult,
  StateSpaceProblem,
  Strategy,
  TraceStep,
} from "./types";

/**
 * Safety cap. The classroom problems are tiny; this only matters if an
 * instructor edits a graph into a cycle, where tree search would not terminate.
 */
const MAX_STEPS = 2000;

/* -------------------------------------------------------------------------
 * Conventions implemented here — these are the rules students are graded on.
 *
 *  - Children are generated LEFT TO RIGHT, i.e. in `problem.edges` order.
 *  - The recorded sequence is the order in which nodes are REMOVED FROM THE
 *    FRONTIER and goal-tested, not the solution path.
 *  - The goal test happens on REMOVAL (expansion), never on generation.
 *    This is what makes UCS correct and it is the single most common
 *    misconception, so it is implemented in exactly one place: the main loop.
 *  - The goal node is included in the recorded sequence, and is never expanded.
 *  - Tree search: repeated states are not pruned. The classroom problems are
 *    acyclic, and pruning would silently change the expected answer.
 * ------------------------------------------------------------------------- */

function startEntry(problem: StateSpaceProblem): FrontierEntry {
  return { node: problem.start, g: 0, depth: 0, path: [problem.start], seq: 0 };
}

function snapshot(frontier: FrontierEntry[]): FrontierEntry[] {
  return frontier.map((e) => ({ ...e, path: [...e.path] }));
}

/** Build the children of `entry`, left to right, without touching the frontier. */
function generateChildren(
  problem: StateSpaceProblem,
  entry: FrontierEntry,
  nextSeq: () => number,
): { children: GeneratedChild[]; entries: FrontierEntry[] } {
  const children: GeneratedChild[] = [];
  const entries: FrontierEntry[] = [];

  for (const edge of childrenOf(problem, entry.node)) {
    const g = entry.g + edge.cost;
    const depth = entry.depth + 1;
    const path = [...entry.path, edge.to];
    children.push({
      node: edge.to,
      edgeCost: edge.cost,
      parent: entry.node,
      parentG: entry.g,
      g,
      depth,
      path,
      isGoal: edge.to === problem.goal,
    });
    entries.push({ node: edge.to, g, depth, path, seq: nextSeq() });
  }

  return { children, entries };
}

function nodeList(entries: FrontierEntry[]): string {
  return entries.length ? entries.map((e) => e.node).join(", ") : "empty";
}

/* ------------------------------- BFS ------------------------------------- */

export function breadthFirstSearch(problem: StateSpaceProblem): SearchResult {
  const steps: TraceStep[] = [];
  const processed: NodeId[] = [];
  let seq = 1;
  const nextSeq = () => seq++;

  // FIFO queue: index 0 is the FRONT, the last index is the BACK.
  const frontier: FrontierEntry[] = [startEntry(problem)];
  let found = false;
  let solutionPath: NodeId[] | null = null;
  let solutionCost: number | null = null;
  let truncated = false;

  while (frontier.length) {
    if (steps.length >= MAX_STEPS) {
      truncated = true;
      break;
    }
    const frontierBefore = snapshot(frontier);
    const current = frontier.shift() as FrontierEntry;
    processed.push(current.node);

    const isGoal = current.node === problem.goal;
    let generated: GeneratedChild[] = [];

    if (!isGoal) {
      const { children, entries } = generateChildren(problem, current, nextSeq);
      generated = children;
      // FIFO: children join the BACK of the queue, left to right.
      frontier.push(...entries);
    } else {
      found = true;
      solutionPath = [...current.path];
      solutionCost = current.g;
    }

    steps.push({
      index: steps.length,
      kind: "expand",
      current: current.node,
      currentG: current.g,
      currentDepth: current.depth,
      currentPath: [...current.path],
      frontierBefore,
      frontierAfter: snapshot(frontier),
      generated,
      cutoff: false,
      isGoal,
      processedSoFar: [...processed],
      note: isGoal
        ? `${current.node} is removed from the front of the queue and the goal test succeeds. Search stops.`
        : `${current.node} is removed because it has been waiting longest (front of the FIFO queue). Its children join the back: ${generated.length ? generated.map((c) => c.node).join(", ") : "none"}.`,
    });

    if (isGoal) break;
  }

  return {
    strategy: "BFS",
    order: processed,
    steps,
    found,
    solutionPath,
    solutionCost,
    truncated,
  };
}

/* ------------------------------- DFS ------------------------------------- */

/**
 * Depth-first search with an explicit stack.
 *
 * `depthLimit === null` means unbounded (plain DFS). Any other value makes this
 * Depth-Limited Search, which is also the inner loop of IDS: a node sitting AT
 * the limit is still removed and goal-tested, but its children are not generated.
 */
export function depthFirstSearch(
  problem: StateSpaceProblem,
  options: { depthLimit?: number | null; stepOffset?: number; limitLabel?: number } = {},
): SearchResult & { cutoffOccurred: boolean } {
  const depthLimit = options.depthLimit ?? null;
  const stepOffset = options.stepOffset ?? 0;

  const steps: TraceStep[] = [];
  const processed: NodeId[] = [];
  let seq = 1;
  const nextSeq = () => seq++;

  // LIFO stack: the LAST index is the TOP of the stack.
  const frontier: FrontierEntry[] = [startEntry(problem)];
  let found = false;
  let cutoffOccurred = false;
  let solutionPath: NodeId[] | null = null;
  let solutionCost: number | null = null;
  let truncated = false;

  while (frontier.length) {
    if (steps.length >= MAX_STEPS) {
      truncated = true;
      break;
    }
    const frontierBefore = snapshot(frontier);
    const current = frontier.pop() as FrontierEntry;
    processed.push(current.node);

    const isGoal = current.node === problem.goal;
    let generated: GeneratedChild[] = [];
    let cutoff = false;

    if (isGoal) {
      found = true;
      solutionPath = [...current.path];
      solutionCost = current.g;
    } else if (depthLimit !== null && current.depth >= depthLimit) {
      // At the limit: goal-tested (above) but not expanded.
      cutoff = true;
      cutoffOccurred = true;
    } else {
      const { children, entries } = generateChildren(problem, current, nextSeq);
      generated = children;
      // Push children in REVERSE so the leftmost child ends up on top of the
      // stack and the visible search proceeds left to right.
      for (let i = entries.length - 1; i >= 0; i--) frontier.push(entries[i]);
    }

    let note: string;
    if (isGoal) {
      note = `${current.node} is removed from the top of the stack and the goal test succeeds. Search stops.`;
    } else if (cutoff) {
      note = `${current.node} is at depth ${current.depth}, which equals the limit L=${depthLimit}. It is goal-tested but NOT expanded (cutoff).`;
    } else if (generated.length) {
      note = `${current.node} is removed from the top of the stack. Children ${generated.map((c) => c.node).join(", ")} are pushed in reverse (${[...generated].reverse().map((c) => c.node).join(", ")}) so ${generated[0].node} ends up on top.`;
    } else {
      note = `${current.node} is removed from the top of the stack. It has no children, so the search backtracks.`;
    }

    steps.push({
      index: stepOffset + steps.length,
      kind: "expand",
      limit: options.limitLabel,
      current: current.node,
      currentG: current.g,
      currentDepth: current.depth,
      currentPath: [...current.path],
      frontierBefore,
      frontierAfter: snapshot(frontier),
      generated,
      cutoff,
      isGoal,
      processedSoFar: [...processed],
      note,
    });

    if (isGoal) break;
  }

  return {
    strategy: depthLimit === null ? "DFS" : "DLS",
    order: processed,
    steps,
    found,
    cutoffOccurred,
    solutionPath,
    solutionCost,
    truncated,
  };
}

/** Depth-Limited Search as a standalone strategy. */
export function depthLimitedSearch(problem: StateSpaceProblem, limit: number): SearchResult {
  const result = depthFirstSearch(problem, { depthLimit: limit, limitLabel: limit });
  return { ...result, strategy: "DLS" };
}

/* ------------------------------- IDS ------------------------------------- */

/**
 * Iterative deepening: depth-limited DFS at L = 0, 1, 2, ... restarting from
 * the start node every time. Repeated nodes are the point of the exercise and
 * are deliberately preserved in every iteration's sequence.
 */
export function iterativeDeepeningSearch(
  problem: StateSpaceProblem,
  options: { maxLimit?: number } = {},
): SearchResult {
  const maxLimit = options.maxLimit ?? Math.max(1, problem.nodes.length);
  const steps: TraceStep[] = [];
  const iterations: IdsIteration[] = [];
  const order: NodeId[] = [];

  let found = false;
  let solutionPath: NodeId[] | null = null;
  let solutionCost: number | null = null;
  let truncated = false;

  for (let limit = 0; limit <= maxLimit; limit++) {
    steps.push({
      index: steps.length,
      kind: "iteration-start",
      limit,
      frontierBefore: [],
      frontierAfter: [startEntry(problem)],
      generated: [],
      cutoff: false,
      isGoal: false,
      processedSoFar: [],
      note:
        limit === 0
          ? `Starting the first iteration with depth limit L=0. Only ${problem.start} is processed.`
          : `Restarting from ${problem.start} with depth limit L=${limit}. Every node above the limit is visited again.`,
    });

    const run = depthFirstSearch(problem, {
      depthLimit: limit,
      stepOffset: steps.length,
      limitLabel: limit,
    });

    steps.push(...run.steps);
    order.push(...run.order);
    iterations.push({
      limit,
      sequence: run.order,
      foundGoal: run.found,
      cutoffOccurred: run.cutoffOccurred,
    });

    steps.push({
      index: steps.length,
      kind: "iteration-end",
      limit,
      frontierBefore: [],
      frontierAfter: [],
      generated: [],
      cutoff: run.cutoffOccurred,
      isGoal: run.found,
      processedSoFar: [...run.order],
      note: run.found
        ? `Goal found within L=${limit}. Iterative deepening stops.`
        : run.cutoffOccurred
          ? `No goal within L=${limit}. Restarting from ${problem.start} with L=${limit + 1}.`
          : `No goal within L=${limit}, and no node was cut off — the whole space has been searched.`,
    });

    if (run.truncated) truncated = true;

    if (run.found) {
      found = true;
      solutionPath = run.solutionPath;
      solutionCost = run.solutionCost;
      break;
    }

    // Nothing was cut off, so deeper limits cannot reveal anything new.
    if (!run.cutoffOccurred) break;
  }

  // Re-index the trace so step numbers are contiguous.
  steps.forEach((s, i) => (s.index = i));

  return {
    strategy: "IDS",
    order,
    iterations,
    steps,
    found,
    solutionPath,
    solutionCost,
    truncated,
  };
}

/* ------------------------------- UCS ------------------------------------- */

/** Priority ordering: lower g first, then earlier insertion order. */
function ucsCompare(a: FrontierEntry, b: FrontierEntry): number {
  if (a.g !== b.g) return a.g - b.g;
  return a.seq - b.seq;
}

/**
 * Uniform-Cost Search.
 *
 * Priority = cumulative path cost g(n). The goal test happens ONLY when the
 * goal is removed from the priority queue — generating the goal proves nothing,
 * because a cheaper path to it may still be waiting in the queue.
 */
export function uniformCostSearch(problem: StateSpaceProblem): SearchResult {
  const steps: TraceStep[] = [];
  const processed: NodeId[] = [];
  let seq = 1;
  const nextSeq = () => seq++;

  // Kept sorted so the frontier renders directly as the priority queue table.
  const frontier: FrontierEntry[] = [startEntry(problem)];
  let found = false;
  let solutionPath: NodeId[] | null = null;
  let solutionCost: number | null = null;
  let truncated = false;

  while (frontier.length) {
    if (steps.length >= MAX_STEPS) {
      truncated = true;
      break;
    }
    const frontierBefore = snapshot(frontier);
    const current = frontier.shift() as FrontierEntry;
    processed.push(current.node);

    const isGoal = current.node === problem.goal;
    let generated: GeneratedChild[] = [];

    if (!isGoal) {
      const { children, entries } = generateChildren(problem, current, nextSeq);
      generated = children;
      frontier.push(...entries);
      frontier.sort(ucsCompare);
    } else {
      found = true;
      solutionPath = [...current.path];
      solutionCost = current.g;
    }

    const goalGenerated = generated.find((c) => c.isGoal);
    let note: string;
    if (isGoal) {
      note = `${current.node} is REMOVED from the priority queue with g=${current.g}. Only now does the goal test apply — the goal is reached with cost ${current.g}.`;
    } else {
      const costs = generated
        .map((c) => `g(${c.node}) = g(${c.parent}) + ${c.edgeCost} = ${c.parentG} + ${c.edgeCost} = ${c.g}`)
        .join("; ");
      note = `${current.node} has the smallest cumulative cost in the queue (g=${current.g}), so it is expanded. ${
        generated.length ? costs : "It has no children."
      }`;
      if (goalGenerated) {
        note += ` ${goalGenerated.node} has been GENERATED with cost ${goalGenerated.g} — do NOT stop yet. UCS applies the goal test when ${goalGenerated.node} is removed from the queue.`;
      }
    }

    steps.push({
      index: steps.length,
      kind: "expand",
      current: current.node,
      currentG: current.g,
      currentDepth: current.depth,
      currentPath: [...current.path],
      frontierBefore,
      frontierAfter: snapshot(frontier),
      generated,
      cutoff: false,
      isGoal,
      processedSoFar: [...processed],
      note,
    });

    if (isGoal) break;
  }

  return {
    strategy: "UCS",
    order: processed,
    steps,
    found,
    solutionPath,
    solutionCost,
    truncated,
  };
}

/* ----------------------------- dispatcher -------------------------------- */

export function runStrategy(problem: StateSpaceProblem, strategy: Strategy): SearchResult {
  switch (strategy) {
    case "BFS":
      return breadthFirstSearch(problem);
    case "DFS":
      return depthFirstSearch(problem, { depthLimit: null });
    case "IDS":
      return iterativeDeepeningSearch(problem);
    case "UCS":
      return uniformCostSearch(problem);
    case "DLS":
      return depthLimitedSearch(problem, problem.depthLimit ?? 2);
  }
}

/** Canonical answer for a strategy, in the shape students submit. */
export function canonicalAnswer(problem: StateSpaceProblem, strategy: Strategy): StrategyAnswer {
  const result = runStrategy(problem, strategy);
  if (strategy === "IDS") {
    return {
      iterations: (result.iterations ?? []).map((it) => ({ limit: it.limit, sequence: it.sequence })),
    };
  }
  return { sequence: result.order };
}

export { nodeList };
