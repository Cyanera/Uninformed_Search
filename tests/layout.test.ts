import { describe, expect, it } from "vitest";
import { layoutProblem } from "@/lib/search/layout";
import { CAMPUS_DELIVERY_ROBOT as P } from "@/lib/search/problem";
import type { StateSpaceProblem } from "@/lib/search/types";

describe("layoutProblem", () => {
  const l = layoutProblem(P);

  it("places every node exactly once", () => {
    expect(l.nodes).toHaveLength(P.nodes.length);
    expect(new Set(l.nodes.map((n) => n.id)).size).toBe(P.nodes.length);
  });

  it("puts each node on the row matching its depth", () => {
    expect(l.byId.S.depth).toBe(0);
    for (const id of ["A", "B", "C"]) expect(l.byId[id].depth).toBe(1);
    for (const id of ["D", "E", "F", "H", "G"]) expect(l.byId[id].depth).toBe(2);
  });

  it("orders siblings left to right in declared child order", () => {
    expect(l.byId.A.x).toBeLessThan(l.byId.B.x);
    expect(l.byId.B.x).toBeLessThan(l.byId.C.x);
    expect(l.byId.D.x).toBeLessThan(l.byId.E.x);
    expect(l.byId.H.x).toBeLessThan(l.byId.G.x);
  });

  it("keeps whole subtrees from overlapping", () => {
    // Everything under A sits to the left of everything under C.
    expect(Math.max(l.byId.D.x, l.byId.E.x)).toBeLessThan(Math.min(l.byId.H.x, l.byId.G.x));
  });

  it("centres a parent over its own children", () => {
    expect(l.byId.A.x).toBeCloseTo((l.byId.D.x + l.byId.E.x) / 2, 5);
    expect(l.byId.C.x).toBeCloseTo((l.byId.H.x + l.byId.G.x) / 2, 5);
  });

  it("marks the start and the goal", () => {
    expect(l.byId.S.isStart).toBe(true);
    expect(l.byId.G.isGoal).toBe(true);
    expect(l.nodes.filter((n) => n.isStart)).toHaveLength(1);
    expect(l.nodes.filter((n) => n.isGoal)).toHaveLength(1);
  });

  it("carries every edge with its cost and endpoints", () => {
    expect(l.edges).toHaveLength(P.edges.length);
    const sb = l.edges.find((e) => e.from === "S" && e.to === "B")!;
    expect(sb.cost).toBe(1);
    expect(sb.x1).toBe(l.byId.S.x);
    expect(sb.y2).toBe(l.byId.B.y);
  });

  it("produces a canvas that contains every node", () => {
    for (const n of l.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(l.width);
      expect(n.y).toBeLessThanOrEqual(l.height);
    }
  });

  it("still lays out a node that is unreachable from the start", () => {
    const orphaned: StateSpaceProblem = {
      ...P,
      nodes: [...P.nodes, { id: "Z", label: "Storeroom" }],
    };
    const lo = layoutProblem(orphaned);
    expect(lo.byId.Z).toBeDefined();
    expect(Number.isFinite(lo.byId.Z.x)).toBe(true);
  });

  it("marks an edge that is not part of the layout tree", () => {
    const dag: StateSpaceProblem = {
      ...P,
      edges: [...P.edges, { from: "B", to: "H", cost: 2 }],
    };
    const ld = layoutProblem(dag);
    // The depth-first walk reaches H through B before it reaches C, so B->H is
    // the tree edge that fixes H's position and C->H is drawn as a cross link.
    expect(ld.edges.find((e) => e.from === "B" && e.to === "H")!.isCrossLink).toBe(false);
    expect(ld.edges.find((e) => e.from === "C" && e.to === "H")!.isCrossLink).toBe(true);
    expect(ld.byId.H).toBeDefined();
  });
});
