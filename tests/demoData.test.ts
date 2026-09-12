import { describe, expect, it } from "vitest";
import { buildDemoStudents, DEMO_DURATION_SECONDS, swapLast } from "../scripts/demoData";
import { detectMisconceptions } from "@/lib/search/misconceptions";
import { scoreStrategy } from "@/lib/search/scoring";
import { CAMPUS_DELIVERY_ROBOT as P } from "@/lib/search/problem";
import type { DemoStrategy } from "../scripts/demoData";

/**
 * `npm run demo` tells the instructor what each demo student got wrong. These
 * tests make sure that claim is true, so the demo cannot quietly drift away
 * from what the engine actually detects.
 */

const students = buildDemoStudents(P);

describe("demo class", () => {
  it("has a student for every panel the dashboard shows", () => {
    expect(students.length).toBeGreaterThanOrEqual(8);
    expect(students.some((s) => s.late)).toBe(true);
    expect(students.some((s) => s.finishedAfter === null)).toBe(true);
    expect(students.some((s) => s.drafts?.length)).toBe(true);
  });

  it("uses unique student IDs, as the database requires", () => {
    const ids = students.map((s) => s.number);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("produces exactly the misconceptions the script advertises", () => {
    for (const student of students) {
      for (const [strategy, expected] of Object.entries(student.expects ?? {})) {
        const answer = student.answers[strategy as DemoStrategy];
        const found = detectMisconceptions(P, strategy as DemoStrategy, answer).map((m) => m.code);
        for (const code of expected) {
          expect(found, `${student.name} / ${strategy}`).toContain(code);
        }
        if (expected.length === 0) {
          expect(found, `${student.name} / ${strategy} should be clean`).toEqual([]);
        }
      }
    }
  });

  it("includes students who are completely correct", () => {
    const perfect = students.filter((s) =>
      (["BFS", "DFS", "IDS", "UCS"] as DemoStrategy[]).every(
        (strategy) => scoreStrategy(P, strategy, s.answers[strategy]).exactMatch,
      ),
    );
    expect(perfect.length).toBe(2);
  });

  it("spreads completion times so the distribution chart is not one bar", () => {
    const times = students.map((s) => s.finishedAfter).filter((t): t is number => t !== null);
    expect(new Set(times).size).toBe(times.length);
    expect(Math.max(...times)).toBeGreaterThan(DEMO_DURATION_SECONDS);
    expect(Math.min(...times)).toBeLessThan(DEMO_DURATION_SECONDS / 2);
  });

  it("marks the only student past the buzzer as late", () => {
    for (const s of students) {
      const past = s.finishedAfter !== null && s.finishedAfter > DEMO_DURATION_SECONDS;
      expect(!!s.late).toBe(past);
    }
  });

  it("gives partial credit, not zero, to the students who slipped late", () => {
    const hessa = students.find((s) => s.name.startsWith("Hessa"))!;
    const ucs = scoreStrategy(P, "UCS", hessa.answers.UCS);
    expect(ucs.exactMatch).toBe(false);
    // A swap of the last two nodes should still leave a long correct prefix.
    expect(ucs.correctPrefixLength).toBe(7);
  });

  it("leaves at least one strategy entirely unanswered", () => {
    const amal = students.find((s) => s.name.startsWith("Amal"))!;
    expect(amal.answers.IDS).toBeUndefined();
    expect(scoreStrategy(P, "IDS", amal.answers.IDS).answered).toBe(false);
  });
});

describe("swapLast", () => {
  it("swaps the final pair", () => {
    expect(swapLast(["A", "B", "C", "D"])).toEqual(["A", "B", "D", "C"]);
  });

  it("leaves short sequences alone", () => {
    expect(swapLast(["A"])).toEqual(["A"]);
    expect(swapLast([])).toEqual([]);
  });
});
