import { describe, expect, it } from "vitest";
import { scoreSequence, scoreStrategy, verdictFor, overallScore } from "@/lib/search/scoring";
import { CAMPUS_DELIVERY_ROBOT as P } from "@/lib/search/problem";

const BFS = ["S", "A", "B", "C", "D", "E", "F", "H", "G"];
const UCS = ["S", "B", "F", "A", "D", "E", "C", "H", "G"];

describe("scoreSequence", () => {
  it("recognises an exact match", () => {
    const s = scoreSequence(BFS, [...BFS]);
    expect(s.exactMatch).toBe(true);
    expect(s.correctPrefixLength).toBe(9);
    expect(s.positionAccuracy).toBe(1);
    expect(s.firstDivergenceIndex).toBeNull();
  });

  it("locates the first divergence", () => {
    // Correct through S, A then wrong: D instead of B at position 3 (index 2).
    const s = scoreSequence(BFS, ["S", "A", "D", "E", "B", "C", "F", "H", "G"]);
    expect(s.exactMatch).toBe(false);
    expect(s.correctPrefixLength).toBe(2);
    expect(s.firstDivergenceIndex).toBe(2);
    expect(s.expectedAtDivergence).toBe("B");
    expect(s.actualAtDivergence).toBe("D");
  });

  it("credits a long correct prefix with one late slip", () => {
    const late = [...BFS];
    late[7] = "G";
    late[8] = "H";
    const s = scoreSequence(BFS, late);
    expect(s.correctPrefixLength).toBe(7);
    expect(s.positionsCorrect).toBe(7);
    expect(s.firstDivergenceIndex).toBe(7);
  });

  it("handles a short answer without inventing a wrong node", () => {
    const s = scoreSequence(BFS, ["S", "A", "B"]);
    expect(s.correctPrefixLength).toBe(3);
    expect(s.firstDivergenceIndex).toBe(3);
    expect(s.expectedAtDivergence).toBe("C");
    expect(s.actualAtDivergence).toBeNull();
    expect(s.lengthDelta).toBe(-6);
  });

  it("does not call a longer answer exact", () => {
    const s = scoreSequence(BFS, [...BFS, "S"]);
    expect(s.exactMatch).toBe(false);
    expect(s.correctPrefixLength).toBe(9);
    expect(s.lengthDelta).toBe(1);
  });

  it("scores an empty answer as zero", () => {
    const s = scoreSequence(BFS, []);
    expect(s.positionAccuracy).toBe(0);
    expect(s.correctPrefixLength).toBe(0);
  });
});

describe("scoreStrategy", () => {
  it("scores a correct UCS submission against the computed canonical answer", () => {
    const s = scoreStrategy(P, "UCS", { sequence: UCS });
    expect(s.exactMatch).toBe(true);
    expect(s.positionsTotal).toBe(9);
    expect(verdictFor(s)).toBe("correct");
  });

  it("marks a missing answer as missing rather than incorrect", () => {
    const s = scoreStrategy(P, "BFS", null);
    expect(s.answered).toBe(false);
    expect(verdictFor(s)).toBe("missing");
  });

  it("marks a wholly wrong answer incorrect", () => {
    const s = scoreStrategy(P, "BFS", { sequence: ["G", "H", "F", "E"] });
    expect(verdictFor(s)).toBe("incorrect");
  });

  it("marks a partly right answer partial", () => {
    const s = scoreStrategy(P, "BFS", { sequence: ["S", "A", "B", "C", "G"] });
    expect(verdictFor(s)).toBe("partial");
    expect(s.correctPrefixLength).toBe(4);
  });

  describe("IDS", () => {
    const correct = {
      iterations: [
        { limit: 0, sequence: ["S"] },
        { limit: 1, sequence: ["S", "A", "B", "C"] },
        { limit: 2, sequence: ["S", "A", "D", "E", "B", "F", "C", "H", "G"] },
      ],
    };

    it("scores each depth limit independently", () => {
      const s = scoreStrategy(P, "IDS", correct);
      expect(s.exactMatch).toBe(true);
      expect(s.iterations).toHaveLength(3);
      expect(s.iterations!.every((i) => i.exactMatch)).toBe(true);
      expect(s.iterationsCorrectCount).toBe(3);
      expect(s.positionsTotal).toBe(14);
    });

    it("gives credit for the iterations that are right", () => {
      const s = scoreStrategy(P, "IDS", {
        iterations: [
          { limit: 0, sequence: ["S"] },
          { limit: 1, sequence: ["S", "A", "B", "C"] },
          { limit: 2, sequence: ["S", "A", "B", "C", "D", "E", "F", "H", "G"] }, // BFS-ish
        ],
      });
      expect(s.exactMatch).toBe(false);
      expect(s.iterationsCorrectCount).toBe(2);
      expect(s.iterations![0].exactMatch).toBe(true);
      expect(s.iterations![1].exactMatch).toBe(true);
      expect(s.iterations![2].exactMatch).toBe(false);
      expect(s.iterations![2].firstDivergenceIndex).toBe(2);
    });

    it("flags a missing iteration", () => {
      const s = scoreStrategy(P, "IDS", { iterations: [{ limit: 0, sequence: ["S"] }] });
      expect(s.iterations![1].present).toBe(false);
      expect(s.iterations![1].positionsCorrect).toBe(0);
      expect(s.exactMatch).toBe(false);
    });

    it("does not call extra invented iterations exact", () => {
      const s = scoreStrategy(P, "IDS", {
        iterations: [...correct.iterations, { limit: 3, sequence: ["S"] }],
      });
      expect(s.exactMatch).toBe(false);
    });

    it("matches iterations by depth limit, not by array position", () => {
      const s = scoreStrategy(P, "IDS", {
        iterations: [...correct.iterations].reverse(),
      });
      expect(s.iterations!.every((i) => i.exactMatch)).toBe(true);
    });
  });
});

describe("overallScore", () => {
  it("weights every strategy equally", () => {
    const scores = [
      scoreStrategy(P, "BFS", { sequence: BFS }),
      scoreStrategy(P, "DFS", { sequence: ["S", "A", "D", "E", "B", "F", "C", "H", "G"] }),
      scoreStrategy(P, "UCS", { sequence: UCS }),
      scoreStrategy(P, "IDS", null),
    ];
    const o = overallScore(scores);
    expect(o.exactCount).toBe(3);
    expect(o.total).toBe(4);
    expect(o.averageAccuracy).toBeCloseTo(0.75, 5);
  });
});
