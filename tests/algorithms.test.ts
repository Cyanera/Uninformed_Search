import { describe, expect, it } from "vitest";
import {
  breadthFirstSearch,
  depthFirstSearch,
  depthLimitedSearch,
  iterativeDeepeningSearch,
  uniformCostSearch,
  canonicalAnswer,
  runStrategy,
} from "@/lib/search/algorithms";
import { CAMPUS_DELIVERY_ROBOT as P, childrenOf, pathCost, validateProblem } from "@/lib/search/problem";
import type { StateSpaceProblem } from "@/lib/search/types";

/* =========================================================================
 * The canonical answers for the default classroom problem.
 * These are the numbers printed on the instructor's answer key, and nothing
 * in the app is allowed to hard-code them anywhere else.
 * ========================================================================= */

const BFS_ORDER = ["S", "A", "B", "C", "D", "E", "F", "H", "G"];
const DFS_ORDER = ["S", "A", "D", "E", "B", "F", "C", "H", "G"];
const UCS_ORDER = ["S", "B", "F", "A", "D", "E", "C", "H", "G"];
const IDS_ITERATIONS = [
  { limit: 0, sequence: ["S"] },
  { limit: 1, sequence: ["S", "A", "B", "C"] },
  { limit: 2, sequence: ["S", "A", "D", "E", "B", "F", "C", "H", "G"] },
];

describe("problem definition", () => {
  it("is structurally valid", () => {
    const v = validateProblem(P);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it("orders children left to right", () => {
    expect(childrenOf(P, "S").map((e) => e.to)).toEqual(["A", "B", "C"]);
    expect(childrenOf(P, "A").map((e) => e.to)).toEqual(["D", "E"]);
    expect(childrenOf(P, "B").map((e) => e.to)).toEqual(["F"]);
    expect(childrenOf(P, "C").map((e) => e.to)).toEqual(["H", "G"]);
    expect(childrenOf(P, "G")).toEqual([]);
  });

  it("has no cycles and reaches the goal", () => {
    expect(validateProblem(P).warnings).toEqual([]);
  });
});

describe("BFS", () => {
  const r = breadthFirstSearch(P);

  it("produces the canonical processing order", () => {
    expect(r.order).toEqual(BFS_ORDER);
  });

  it("includes the goal and stops there", () => {
    expect(r.order.at(-1)).toBe("G");
    expect(r.order.filter((n) => n === "G")).toHaveLength(1);
    expect(r.found).toBe(true);
  });

  it("is FIFO: the frontier is drained from the front", () => {
    // After expanding S the queue is [A, B, C]; after expanding A the queue is
    // [B, C, D, E] — the new children go to the BACK, not the front.
    expect(r.steps[0].frontierAfter.map((e) => e.node)).toEqual(["A", "B", "C"]);
    expect(r.steps[1].frontierAfter.map((e) => e.node)).toEqual(["B", "C", "D", "E"]);
    expect(r.steps[2].frontierAfter.map((e) => e.node)).toEqual(["C", "D", "E", "F"]);
    expect(r.steps[3].frontierAfter.map((e) => e.node)).toEqual(["D", "E", "F", "H", "G"]);
  });

  it("processes shallower nodes before deeper ones", () => {
    const depthOf = (n: string) => r.steps.find((s) => s.current === n)!.currentDepth!;
    for (let i = 1; i < r.order.length; i++) {
      expect(depthOf(r.order[i])).toBeGreaterThanOrEqual(depthOf(r.order[i - 1]));
    }
  });

  it("goal-tests on removal, not on generation", () => {
    // G is generated while expanding C (step index 3) but processed much later.
    const generatingStep = r.steps.findIndex((s) => s.generated.some((c) => c.node === "G"));
    const processingStep = r.steps.findIndex((s) => s.current === "G");
    expect(generatingStep).toBeLessThan(processingStep);
  });

  it("does not expand the goal", () => {
    expect(r.steps.at(-1)!.generated).toEqual([]);
  });

  it("reports the solution path it actually found", () => {
    expect(r.solutionPath).toEqual(["S", "C", "G"]);
    expect(r.solutionCost).toBe(11);
  });
});

describe("DFS", () => {
  const r = depthFirstSearch(P, { depthLimit: null });

  it("produces the canonical processing order", () => {
    expect(r.order).toEqual(DFS_ORDER);
  });

  it("follows the leftmost branch to the bottom first", () => {
    // S then A (leftmost child) then D (leftmost child of A) — not B.
    expect(r.order.slice(0, 3)).toEqual(["S", "A", "D"]);
  });

  it("pushes children in reverse so the leftmost child sits on top of the stack", () => {
    // Stack is stored bottom-first, so the TOP is the last element.
    const afterS = r.steps[0].frontierAfter.map((e) => e.node);
    expect(afterS).toEqual(["C", "B", "A"]);
    expect(afterS.at(-1)).toBe("A");
  });

  it("reports children left to right even though they are pushed in reverse", () => {
    expect(r.steps[0].generated.map((c) => c.node)).toEqual(["A", "B", "C"]);
  });

  it("is LIFO: the most recently added node is processed next", () => {
    const afterA = r.steps[1].frontierAfter.map((e) => e.node);
    expect(afterA).toEqual(["C", "B", "E", "D"]);
    expect(r.steps[2].current).toBe("D");
  });

  it("backtracks to B only after A's whole subtree is done", () => {
    expect(r.order.indexOf("B")).toBeGreaterThan(r.order.indexOf("E"));
  });

  it("includes the goal and stops there", () => {
    expect(r.order.at(-1)).toBe("G");
    expect(r.found).toBe(true);
  });
});

describe("Depth-Limited Search", () => {
  it("processes only the start node at L=0", () => {
    const r = depthLimitedSearch(P, 0);
    expect(r.order).toEqual(["S"]);
    expect(r.found).toBe(false);
  });

  it("goal-tests nodes at the limit but does not expand them", () => {
    const r = depthLimitedSearch(P, 1);
    expect(r.order).toEqual(["S", "A", "B", "C"]);
    // A, B and C sit AT the limit: each was processed, none generated children.
    for (const n of ["A", "B", "C"]) {
      const step = r.steps.find((s) => s.current === n)!;
      expect(step.cutoff).toBe(true);
      expect(step.generated).toEqual([]);
    }
  });

  it("finds the goal at L=2", () => {
    const r = depthLimitedSearch(P, 2);
    expect(r.order).toEqual(DFS_ORDER);
    expect(r.found).toBe(true);
  });

  it("reports a cutoff only when a node was actually truncated", () => {
    expect(depthFirstSearch(P, { depthLimit: 1 }).cutoffOccurred).toBe(true);
    // At L=5 nothing is deeper than the limit, so no cutoff occurs.
    expect(depthFirstSearch(P, { depthLimit: 5 }).cutoffOccurred).toBe(false);
  });
});

describe("IDS", () => {
  const r = iterativeDeepeningSearch(P);

  it("produces the canonical iterations", () => {
    expect(r.iterations!.map((it) => ({ limit: it.limit, sequence: it.sequence }))).toEqual(IDS_ITERATIONS);
  });

  it("restarts from the start node at every depth limit", () => {
    for (const it of r.iterations!) {
      expect(it.sequence[0]).toBe(P.start);
    }
  });

  it("revisits upper levels — repeated nodes are kept, not deduplicated", () => {
    const flat = r.order;
    expect(flat.filter((n) => n === "S")).toHaveLength(3);
    expect(flat.filter((n) => n === "A")).toHaveLength(2);
    // The full concatenation is longer than the set of distinct nodes.
    expect(flat.length).toBe(1 + 4 + 9);
    expect(new Set(flat).size).toBe(9);
  });

  it("stops at the first limit that reaches the goal", () => {
    expect(r.iterations!).toHaveLength(3);
    expect(r.iterations!.at(-1)!.foundGoal).toBe(true);
    expect(r.iterations!.slice(0, -1).every((it) => !it.foundGoal)).toBe(true);
  });

  it("matches a plain DLS run at each limit", () => {
    for (const it of r.iterations!) {
      expect(it.sequence).toEqual(depthLimitedSearch(P, it.limit).order);
    }
  });

  it("emits iteration boundaries in the trace for Teach Mode", () => {
    const starts = r.steps.filter((s) => s.kind === "iteration-start").map((s) => s.limit);
    const ends = r.steps.filter((s) => s.kind === "iteration-end").map((s) => s.limit);
    expect(starts).toEqual([0, 1, 2]);
    expect(ends).toEqual([0, 1, 2]);
    expect(r.steps.map((s) => s.index)).toEqual(r.steps.map((_, i) => i));
  });

  it("terminates when the space is exhausted without a goal", () => {
    const noGoal: StateSpaceProblem = { ...P, goal: "Z", nodes: [...P.nodes, { id: "Z" }] };
    const run = iterativeDeepeningSearch(noGoal);
    expect(run.found).toBe(false);
    // L=0,1,2 then L=3 exhausts the tree with no cutoff, so it stops.
    expect(run.iterations!.map((i) => i.limit)).toEqual([0, 1, 2, 3]);
  });
});

describe("UCS", () => {
  const r = uniformCostSearch(P);

  it("produces the canonical processing order", () => {
    expect(r.order).toEqual(UCS_ORDER);
  });

  it("expands nodes in non-decreasing cumulative cost", () => {
    const gOf = (n: string) => r.steps.find((s) => s.current === n)!.currentG!;
    const costs = r.order.map(gOf);
    expect(costs).toEqual([0, 1, 3, 4, 5, 7, 8, 9, 11]);
    for (let i = 1; i < costs.length; i++) {
      expect(costs[i]).toBeGreaterThanOrEqual(costs[i - 1]);
    }
  });

  it("computes g(child) = g(parent) + edge cost", () => {
    const fStep = r.steps.find((s) => s.generated.some((c) => c.node === "F"))!;
    const f = fStep.generated.find((c) => c.node === "F")!;
    expect(f.parent).toBe("B");
    expect(f.parentG).toBe(1);
    expect(f.edgeCost).toBe(2);
    expect(f.g).toBe(3);
  });

  it("prefers the cheap branch over the left-most branch", () => {
    // B (g=1) beats A (g=4) even though A is generated first.
    expect(r.order.indexOf("B")).toBeLessThan(r.order.indexOf("A"));
    // ...and F (g=3) beats A (g=4) even though F is deeper.
    expect(r.order.indexOf("F")).toBeLessThan(r.order.indexOf("A"));
  });

  it("keeps the priority queue sorted by cumulative cost", () => {
    for (const step of r.steps) {
      const gs = step.frontierAfter.map((e) => e.g);
      expect([...gs].sort((a, b) => a - b)).toEqual(gs);
    }
    // After expanding S the queue is B(1), A(4), C(8) — not insertion order.
    expect(r.steps[0].frontierAfter.map((e) => e.node)).toEqual(["B", "A", "C"]);
    expect(r.steps[0].frontierAfter.map((e) => e.g)).toEqual([1, 4, 8]);
  });

  it("does NOT stop when the goal is merely generated", () => {
    const genStep = r.steps.findIndex((s) => s.generated.some((c) => c.node === "G"));
    const popStep = r.steps.findIndex((s) => s.current === "G");
    expect(genStep).toBeGreaterThanOrEqual(0);
    expect(popStep).toBeGreaterThan(genStep);
    // H (g=9) is expanded in between, precisely because G (g=11) is not cheapest yet.
    expect(r.order.slice(genStep + 1, popStep + 1)).toEqual(["H", "G"]);
  });

  it("applies the goal test on expansion, with the right cost", () => {
    const goalStep = r.steps.at(-1)!;
    expect(goalStep.current).toBe("G");
    expect(goalStep.isGoal).toBe(true);
    expect(goalStep.currentG).toBe(11);
    expect(r.solutionPath).toEqual(["S", "C", "G"]);
    expect(r.solutionCost).toBe(11);
    expect(pathCost(P, r.solutionPath!)).toBe(11);
  });

  it("breaks ties by insertion order, then by left-to-right generation", () => {
    const tie: StateSpaceProblem = {
      name: "tie",
      start: "S",
      goal: "Z",
      nodes: [{ id: "S" }, { id: "X" }, { id: "Y" }, { id: "Z" }],
      edges: [
        { from: "S", to: "X", cost: 5 },
        { from: "S", to: "Y", cost: 5 },
        { from: "Y", to: "Z", cost: 1 },
      ],
    };
    // X and Y both cost 5; X was generated first (left to right) so X goes first.
    expect(uniformCostSearch(tie).order).toEqual(["S", "X", "Y", "Z"]);
  });

  it("returns the cheapest path, not the first path found", () => {
    const cheaperLater: StateSpaceProblem = {
      name: "cheaper later",
      start: "S",
      goal: "G",
      nodes: [{ id: "S" }, { id: "P" }, { id: "Q" }, { id: "G" }],
      edges: [
        { from: "S", to: "P", cost: 1 },
        { from: "S", to: "Q", cost: 2 },
        { from: "P", to: "G", cost: 10 },
        { from: "Q", to: "G", cost: 3 },
      ],
    };
    const run = uniformCostSearch(cheaperLater);
    // G is generated at cost 11 via P, then at cost 5 via Q; the cheap one wins.
    expect(run.solutionPath).toEqual(["S", "Q", "G"]);
    expect(run.solutionCost).toBe(5);
    expect(run.order).toEqual(["S", "P", "Q", "G"]);
  });
});

describe("strategies produce genuinely different orders", () => {
  it("no two strategies agree on the default problem", () => {
    const orders = [BFS_ORDER, DFS_ORDER, UCS_ORDER].map((o) => o.join(","));
    expect(new Set(orders).size).toBe(3);
  });
});

describe("canonicalAnswer", () => {
  it("returns the submission shape for sequence strategies", () => {
    expect(canonicalAnswer(P, "BFS")).toEqual({ sequence: BFS_ORDER });
    expect(canonicalAnswer(P, "DFS")).toEqual({ sequence: DFS_ORDER });
    expect(canonicalAnswer(P, "UCS")).toEqual({ sequence: UCS_ORDER });
  });

  it("preserves iterations for IDS", () => {
    expect(canonicalAnswer(P, "IDS")).toEqual({ iterations: IDS_ITERATIONS });
  });

  it("is reachable through the dispatcher", () => {
    expect(runStrategy(P, "BFS").order).toEqual(BFS_ORDER);
    expect(runStrategy(P, "DFS").order).toEqual(DFS_ORDER);
    expect(runStrategy(P, "UCS").order).toEqual(UCS_ORDER);
    expect(runStrategy(P, "DLS").order).toEqual(["S", "A", "D", "E", "B", "F", "C", "H", "G"]);
  });
});

describe("engine is generic, not tuned to one graph", () => {
  const other: StateSpaceProblem = {
    name: "other",
    start: "R",
    goal: "T",
    nodes: [{ id: "R" }, { id: "M" }, { id: "N" }, { id: "T" }],
    edges: [
      { from: "R", to: "M", cost: 1 },
      { from: "R", to: "N", cost: 1 },
      { from: "M", to: "T", cost: 9 },
      { from: "N", to: "T", cost: 1 },
    ],
  };

  it("runs all four strategies on a different problem", () => {
    expect(breadthFirstSearch(other).order).toEqual(["R", "M", "N", "T"]);
    expect(depthFirstSearch(other, { depthLimit: null }).order).toEqual(["R", "M", "T"]);
    expect(uniformCostSearch(other).order).toEqual(["R", "M", "N", "T"]);
    expect(iterativeDeepeningSearch(other).iterations!.map((i) => i.sequence)).toEqual([
      ["R"],
      ["R", "M", "N"],
      ["R", "M", "T"],
    ]);
  });

  it("DFS finds an expensive path that UCS rejects", () => {
    expect(depthFirstSearch(other, { depthLimit: null }).solutionCost).toBe(10);
    expect(uniformCostSearch(other).solutionCost).toBe(2);
  });
});
