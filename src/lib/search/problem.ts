import type { NodeId, ProblemEdge, ProblemNode, StateSpaceProblem } from "./types";

/**
 * The built-in classroom scenario.
 *
 * Directed, acyclic, small enough to solve by hand, but deliberately shaped so
 * that BFS, DFS, IDS and UCS all produce *different* processing orders — the
 * cheap branch (S->B) is not on the solution path, and the goal hides behind
 * the most expensive first move (S->C).
 *
 * Child order is the order of the `edges` array:
 *   Children(S) = [A, B, C]
 *   Children(A) = [D, E]
 *   Children(B) = [F]
 *   Children(C) = [H, G]
 */
export const CAMPUS_DELIVERY_ROBOT: StateSpaceProblem = {
  name: "Campus Delivery Robot",
  story:
    "A delivery robot starts at the Main Gate (S) and must reach the AI Lab (G). Edge costs are travel times between campus locations.",
  start: "S",
  goal: "G",
  nodes: [
    { id: "S", label: "Main Gate" },
    { id: "A", label: "Library" },
    { id: "B", label: "Student Center" },
    { id: "C", label: "Engineering Building" },
    { id: "D", label: "Study Hall" },
    { id: "E", label: "Media Lab" },
    { id: "F", label: "Coffee Point" },
    { id: "H", label: "Robotics Lab" },
    { id: "G", label: "AI Lab" },
  ],
  edges: [
    { from: "S", to: "A", cost: 4 },
    { from: "S", to: "B", cost: 1 },
    { from: "S", to: "C", cost: 8 },
    { from: "A", to: "D", cost: 1 },
    { from: "A", to: "E", cost: 3 },
    { from: "B", to: "F", cost: 2 },
    { from: "C", to: "H", cost: 1 },
    { from: "C", to: "G", cost: 3 },
  ],
  depthLimit: 2,
};

/**
 * Children of `node`, left to right, in `edges` array order.
 * This is the single source of truth for the child-ordering convention.
 */
export function childrenOf(problem: StateSpaceProblem, node: NodeId): ProblemEdge[] {
  return problem.edges.filter((e) => e.from === node);
}

export function nodeIds(problem: StateSpaceProblem): NodeId[] {
  return problem.nodes.map((n) => n.id);
}

export function nodeLabel(problem: StateSpaceProblem, id: NodeId): string | undefined {
  return problem.nodes.find((n) => n.id === id)?.label;
}

export function findNode(problem: StateSpaceProblem, id: NodeId): ProblemNode | undefined {
  return problem.nodes.find((n) => n.id === id);
}

/** Total cost of a node sequence interpreted as a path. Null if not a real path. */
export function pathCost(problem: StateSpaceProblem, path: NodeId[]): number | null {
  let total = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const edge = problem.edges.find((e) => e.from === path[i] && e.to === path[i + 1]);
    if (!edge) return null;
    total += edge.cost;
  }
  return total;
}

export interface ProblemValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** Structural checks used by the instructor activity editor. */
export function validateProblem(problem: StateSpaceProblem): ProblemValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const ids = new Set<string>();

  for (const n of problem.nodes) {
    if (!n.id.trim()) errors.push("A node has an empty id.");
    if (ids.has(n.id)) errors.push(`Duplicate node id "${n.id}".`);
    ids.add(n.id);
  }
  if (!ids.has(problem.start)) errors.push(`Start node "${problem.start}" is not in the node list.`);
  if (!ids.has(problem.goal)) errors.push(`Goal node "${problem.goal}" is not in the node list.`);
  if (problem.start === problem.goal) warnings.push("Start and goal are the same node — the search ends immediately.");

  for (const e of problem.edges) {
    if (!ids.has(e.from)) errors.push(`Edge references unknown node "${e.from}".`);
    if (!ids.has(e.to)) errors.push(`Edge references unknown node "${e.to}".`);
    if (!Number.isFinite(e.cost)) errors.push(`Edge ${e.from}->${e.to} has a non-numeric cost.`);
    else if (e.cost < 0) errors.push(`Edge ${e.from}->${e.to} has a negative cost. Uniform-Cost Search requires non-negative costs.`);
  }

  if (hasCycle(problem)) {
    warnings.push(
      "The graph contains a cycle. The engine uses tree search, so repeated states will be re-expanded and a depth cap will stop runaway searches.",
    );
  }
  if (!reaches(problem, problem.start, problem.goal)) {
    warnings.push(`The goal "${problem.goal}" is not reachable from the start "${problem.start}".`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

export function hasCycle(problem: StateSpaceProblem): boolean {
  const visiting = new Set<NodeId>();
  const done = new Set<NodeId>();

  const walk = (id: NodeId): boolean => {
    if (visiting.has(id)) return true;
    if (done.has(id)) return false;
    visiting.add(id);
    for (const e of childrenOf(problem, id)) {
      if (walk(e.to)) return true;
    }
    visiting.delete(id);
    done.add(id);
    return false;
  };

  return problem.nodes.some((n) => walk(n.id));
}

export function reaches(problem: StateSpaceProblem, from: NodeId, to: NodeId): boolean {
  const seen = new Set<NodeId>([from]);
  const queue: NodeId[] = [from];
  while (queue.length) {
    const cur = queue.shift() as NodeId;
    if (cur === to) return true;
    for (const e of childrenOf(problem, cur)) {
      if (!seen.has(e.to)) {
        seen.add(e.to);
        queue.push(e.to);
      }
    }
  }
  return false;
}

/** Deep copy — used when freezing a problem into a session snapshot. */
export function cloneProblem(problem: StateSpaceProblem): StateSpaceProblem {
  return JSON.parse(JSON.stringify(problem)) as StateSpaceProblem;
}
