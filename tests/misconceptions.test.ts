import { describe, expect, it } from "vitest";
import { detectMisconceptions } from "@/lib/search/misconceptions";
import {
  goalOnGenerationOrder,
  greedyEdgeCostOrder,
  idsWithoutRestartIterations,
} from "@/lib/search/references";
import { CAMPUS_DELIVERY_ROBOT as P } from "@/lib/search/problem";
import { uniformCostSearch } from "@/lib/search/algorithms";
import type { StateSpaceProblem } from "@/lib/search/types";

const BFS = ["S", "A", "B", "C", "D", "E", "F", "H", "G"];
const DFS = ["S", "A", "D", "E", "B", "F", "C", "H", "G"];
const UCS = ["S", "B", "F", "A", "D", "E", "C", "H", "G"];

const codes = (...args: Parameters<typeof detectMisconceptions>) =>
  detectMisconceptions(...args).map((m) => m.code);

describe("no false positives on correct work", () => {
  it("stays silent for every correct answer", () => {
    expect(codes(P, "BFS", { sequence: BFS })).toEqual([]);
    expect(codes(P, "DFS", { sequence: DFS })).toEqual([]);
    expect(codes(P, "UCS", { sequence: UCS })).toEqual([]);
    expect(
      codes(P, "IDS", {
        iterations: [
          { limit: 0, sequence: ["S"] },
          { limit: 1, sequence: ["S", "A", "B", "C"] },
          { limit: 2, sequence: DFS },
        ],
      }),
    ).toEqual([]);
  });

  it("stays silent on an empty answer", () => {
    expect(codes(P, "BFS", { sequence: [] })).toEqual([]);
    expect(codes(P, "BFS", null)).toEqual([]);
  });
});

describe("strategy confusion", () => {
  it("flags a BFS answer that is really DFS", () => {
    const found = detectMisconceptions(P, "BFS", { sequence: DFS });
    expect(found.map((m) => m.code)).toContain("bfs-behaves-like-dfs");
    expect(found.find((m) => m.code === "bfs-behaves-like-dfs")!.confidence).toBe("likely");
  });

  it("flags a DFS answer that is really BFS", () => {
    const found = detectMisconceptions(P, "DFS", { sequence: BFS });
    expect(found.map((m) => m.code)).toContain("dfs-behaves-like-bfs");
  });

  it("flags a near-miss as a weaker signal, not a certainty", () => {
    const nearlyDfs = ["S", "A", "D", "E", "B", "F", "C", "G", "H"];
    const found = detectMisconceptions(P, "BFS", { sequence: nearlyDfs });
    const hit = found.find((m) => m.code === "bfs-behaves-like-dfs");
    expect(hit).toBeDefined();
    expect(hit!.confidence).toBe("possible");
  });

  it("does not flag a merely sloppy BFS answer as DFS", () => {
    const sloppy = ["S", "A", "B", "C", "D", "E", "F", "G"];
    expect(codes(P, "BFS", { sequence: sloppy })).not.toContain("bfs-behaves-like-dfs");
  });
});

describe("goal test on generation", () => {
  it("builds the early-stop reference for UCS", () => {
    // G is generated while expanding C, so a student stopping there skips H.
    expect(goalOnGenerationOrder(P, "UCS")).toEqual(["S", "B", "F", "A", "D", "E", "C", "G"]);
  });

  it("flags a UCS answer that stops when G is generated", () => {
    const found = detectMisconceptions(P, "UCS", { sequence: ["S", "B", "F", "A", "D", "E", "C", "G"] });
    expect(found.map((m) => m.code)).toContain("goal-test-on-generation");
    expect(found.find((m) => m.code === "goal-test-on-generation")!.confidence).toBe("likely");
  });

  it("flags the same error in BFS", () => {
    expect(goalOnGenerationOrder(P, "BFS")).toEqual(["S", "A", "B", "C", "G"]);
    expect(codes(P, "BFS", { sequence: ["S", "A", "B", "C", "G"] })).toContain("goal-test-on-generation");
  });

  it("returns null when the error would be invisible", () => {
    // Goal is generated last and expanded immediately: nothing to distinguish.
    const trivial: StateSpaceProblem = {
      name: "trivial",
      start: "S",
      goal: "G",
      nodes: [{ id: "S" }, { id: "G" }],
      edges: [{ from: "S", to: "G", cost: 1 }],
    };
    expect(goalOnGenerationOrder(trivial, "BFS")).toBeNull();
  });
});

describe("UCS step cost vs cumulative cost", () => {
  it("is not reported on the default graph, because it is indistinguishable there", () => {
    // On this particular graph, greedy-by-edge-cost happens to produce the same
    // order as correct UCS, so reporting it would be a guess dressed as a finding.
    expect(greedyEdgeCostOrder(P)).toBeNull();
    expect(codes(P, "UCS", { sequence: UCS })).toEqual([]);
  });

  it("is reported on a graph where the two genuinely differ", () => {
    const discriminating: StateSpaceProblem = {
      name: "step vs cumulative",
      start: "S",
      goal: "G",
      nodes: [{ id: "S" }, { id: "A" }, { id: "B" }, { id: "P" }, { id: "G" }],
      edges: [
        { from: "S", to: "A", cost: 1 },
        { from: "S", to: "B", cost: 6 },
        { from: "A", to: "P", cost: 5 },
        { from: "B", to: "G", cost: 1 },
      ],
    };
    // P is reached by an expensive edge from a cheap parent (g=6, edge 5);
    // B is reached by an expensive edge too (g=6, edge 6). Comparing edges puts
    // P first, comparing cumulative cost puts B first.
    const greedy = greedyEdgeCostOrder(discriminating);
    expect(greedy).toEqual(["S", "A", "P", "B", "G"]);
    expect(uniformCostSearch(discriminating).order).toEqual(["S", "A", "B", "P", "G"]);
    const found = detectMisconceptions(discriminating, "UCS", { sequence: greedy! });
    expect(found.map((m) => m.code)).toContain("ucs-step-cost-not-cumulative");
  });
});

describe("IDS misconceptions", () => {
  it("builds the no-restart reference", () => {
    expect(idsWithoutRestartIterations(P)).toEqual([
      { limit: 0, sequence: ["S"] },
      { limit: 1, sequence: ["A", "B", "C"] },
      { limit: 2, sequence: ["D", "E", "F", "H", "G"] },
    ]);
  });

  it("flags iterations that do not restart from the start node", () => {
    const found = detectMisconceptions(P, "IDS", {
      iterations: [
        { limit: 0, sequence: ["S"] },
        { limit: 1, sequence: ["A", "B", "C"] },
        { limit: 2, sequence: ["D", "E", "F", "H", "G"] },
      ],
    });
    const found_codes = found.map((m) => m.code);
    expect(found_codes).toContain("ids-no-restart");
    expect(found_codes).toContain("ids-deduplicated");
  });

  it("flags an answer with no repeated nodes anywhere", () => {
    expect(
      codes(P, "IDS", {
        iterations: [
          { limit: 0, sequence: ["S"] },
          { limit: 1, sequence: ["A", "B"] },
          { limit: 2, sequence: ["C", "D", "E", "F", "H", "G"] },
        ],
      }),
    ).toContain("ids-deduplicated");
  });

  it("flags a single depth-limited run submitted as IDS", () => {
    expect(codes(P, "IDS", { iterations: [{ limit: 2, sequence: DFS }] })).toContain("ids-single-iteration");
  });

  it("flags expanding nodes that sit at the depth limit", () => {
    const found = codes(P, "IDS", {
      iterations: [
        { limit: 0, sequence: ["S"] },
        { limit: 1, sequence: ["S", "A", "D", "E", "B", "C"] },
        { limit: 2, sequence: DFS },
      ],
    });
    expect(found).toContain("ids-ignores-cutoff");
  });

  it("does not flag cutoff problems when the real error is a missing restart", () => {
    const found = codes(P, "IDS", {
      iterations: [
        { limit: 0, sequence: ["S"] },
        { limit: 1, sequence: ["A", "B", "C", "D", "E", "F", "H"] },
      ],
    });
    expect(found).toContain("ids-no-restart");
    expect(found).not.toContain("ids-ignores-cutoff");
  });
});

describe("answering the wrong question", () => {
  it("flags a submitted solution path", () => {
    const found = detectMisconceptions(P, "BFS", { sequence: ["S", "C", "G"] });
    expect(found.map((m) => m.code)).toContain("solution-path-not-search-order");
  });

  it("flags a missing goal node", () => {
    expect(codes(P, "DFS", { sequence: ["S", "A", "D", "E", "B", "F", "C", "H"] })).toContain("goal-missing");
  });

  it("does not flag a missing goal on a one-node answer", () => {
    expect(codes(P, "DFS", { sequence: ["S"] })).not.toContain("goal-missing");
  });
});

describe("report shape", () => {
  it("never reports the same code twice", () => {
    const found = detectMisconceptions(P, "IDS", {
      iterations: [
        { limit: 0, sequence: ["S"] },
        { limit: 1, sequence: ["A", "B", "C"] },
        { limit: 2, sequence: ["D", "E", "F", "H", "G"] },
      ],
    });
    expect(new Set(found.map((m) => m.code)).size).toBe(found.length);
  });

  it("phrases every finding as a possibility", () => {
    const found = detectMisconceptions(P, "BFS", { sequence: DFS });
    expect(found.length).toBeGreaterThan(0);
    for (const m of found) {
      expect(m.title.toLowerCase()).toMatch(/^(may|submitted|goal node is)/);
      expect(m.detail.length).toBeGreaterThan(20);
    }
  });
});
