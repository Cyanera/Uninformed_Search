/**
 * Shared types for the state-space problem definition, the search engine and
 * the step-by-step trace used by Teach Mode.
 *
 * Nothing in here is specific to the "Campus Delivery Robot" problem: the
 * engine runs on any problem the instructor defines.
 */

export type NodeId = string;

export type Strategy = "BFS" | "DFS" | "IDS" | "UCS" | "DLS";

/** Strategies enabled in the default student activity. DLS is opt-in. */
export const DEFAULT_STRATEGIES: Strategy[] = ["BFS", "DFS", "IDS", "UCS"];
export const ALL_STRATEGIES: Strategy[] = ["BFS", "DFS", "IDS", "UCS", "DLS"];

export const STRATEGY_NAMES: Record<Strategy, string> = {
  BFS: "Breadth-First Search",
  DFS: "Depth-First Search",
  IDS: "Iterative Deepening Search",
  UCS: "Uniform-Cost Search",
  DLS: "Depth-Limited Search",
};

/** A strategy whose answer is a single sequence of processed nodes. */
export type SequenceStrategy = "BFS" | "DFS" | "UCS" | "DLS";

export function isSequenceStrategy(s: Strategy): s is SequenceStrategy {
  return s !== "IDS";
}

export interface ProblemNode {
  id: NodeId;
  /** Optional friendly name, e.g. "Library". Purely cosmetic. */
  label?: string;
}

export interface ProblemEdge {
  from: NodeId;
  to: NodeId;
  cost: number;
}

/**
 * A directed state space.
 *
 * Child ordering is *positional*: the children of a node are the `edges`
 * entries whose `from` matches, in array order. That makes the left-to-right
 * convention explicit and editable, rather than implied by sorting.
 */
export interface StateSpaceProblem {
  name: string;
  story?: string;
  start: NodeId;
  goal: NodeId;
  nodes: ProblemNode[];
  edges: ProblemEdge[];
  /** Depth limit used when DLS runs as a standalone strategy. */
  depthLimit?: number;
}

/** One entry sitting in the frontier. */
export interface FrontierEntry {
  node: NodeId;
  /** Cumulative path cost g(n) from the start node. */
  g: number;
  /** Number of edges from the start node. */
  depth: number;
  /** Full path from start to this node, inclusive. */
  path: NodeId[];
  /** Monotonic insertion counter — the UCS tie-breaker. */
  seq: number;
}

/** A child generated while expanding the current node. */
export interface GeneratedChild {
  node: NodeId;
  edgeCost: number;
  parent: NodeId;
  parentG: number;
  /** g(child) = g(parent) + edgeCost */
  g: number;
  depth: number;
  path: NodeId[];
  /** True when the child is the goal. UCS must NOT stop here. */
  isGoal: boolean;
}

export type TraceStepKind = "expand" | "iteration-start" | "iteration-end";

/**
 * One step of the search, rich enough to drive the Teach Mode visualiser
 * without recomputing anything.
 */
export interface TraceStep {
  index: number;
  kind: TraceStepKind;
  /** Present on every step for IDS; undefined for the other strategies. */
  limit?: number;
  /** The node removed from the frontier and goal-tested on this step. */
  current?: NodeId;
  currentG?: number;
  currentDepth?: number;
  currentPath?: NodeId[];
  frontierBefore: FrontierEntry[];
  frontierAfter: FrontierEntry[];
  generated: GeneratedChild[];
  /** True when the node sat at the depth limit, so its children were not generated. */
  cutoff: boolean;
  /** True when the node removed from the frontier is the goal. */
  isGoal: boolean;
  /** Processed order accumulated so far, within the current iteration for IDS. */
  processedSoFar: NodeId[];
  /** Human-readable narration shown on the projector. */
  note?: string;
}

export interface IdsIteration {
  limit: number;
  sequence: NodeId[];
  foundGoal: boolean;
  /** True when the iteration was stopped by the depth limit rather than exhausting the space. */
  cutoffOccurred: boolean;
}

export interface SearchResult {
  strategy: Strategy;
  /**
   * Order in which nodes were REMOVED FROM THE FRONTIER / goal-tested.
   * For IDS this is the concatenation of every iteration; the per-iteration
   * breakdown lives in `iterations` and is what students actually submit.
   */
  order: NodeId[];
  iterations?: IdsIteration[];
  steps: TraceStep[];
  found: boolean;
  solutionPath: NodeId[] | null;
  solutionCost: number | null;
  /** Set when a safety cap stopped the search (malformed / cyclic problem). */
  truncated?: boolean;
}

/** The shape stored in `strategy_submissions.answer_json`. */
export type StrategyAnswer =
  | { sequence: NodeId[] }
  | { iterations: { limit: number; sequence: NodeId[] }[] };

export interface SequenceAnswer {
  sequence: NodeId[];
}
export interface IterationsAnswer {
  iterations: { limit: number; sequence: NodeId[] }[];
}

export function isIterationsAnswer(a: StrategyAnswer | null | undefined): a is IterationsAnswer {
  return !!a && Array.isArray((a as IterationsAnswer).iterations);
}

export function isSequenceAnswer(a: StrategyAnswer | null | undefined): a is SequenceAnswer {
  return !!a && Array.isArray((a as SequenceAnswer).sequence);
}
