import { describe, expect, it } from "vitest";
import { answerIsEmpty, cleanText, isStrategy, validateAnswer } from "@/lib/api";
import { CAMPUS_DELIVERY_ROBOT as P } from "@/lib/search/problem";

describe("validateAnswer", () => {
  it("accepts a well-formed sequence", () => {
    const r = validateAnswer(P, "BFS", { sequence: ["S", "A", "B"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.answer).toEqual({ sequence: ["S", "A", "B"] });
  });

  it("rejects a node that is not in this problem", () => {
    const r = validateAnswer(P, "BFS", { sequence: ["S", "Z"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('"Z"');
  });

  it("rejects non-string entries", () => {
    expect(validateAnswer(P, "BFS", { sequence: ["S", 7] }).ok).toBe(false);
    expect(validateAnswer(P, "BFS", { sequence: "SABC" }).ok).toBe(false);
    expect(validateAnswer(P, "BFS", {}).ok).toBe(false);
    expect(validateAnswer(P, "BFS", null).ok).toBe(false);
  });

  it("rejects an absurdly long sequence", () => {
    const long = Array.from({ length: 401 }, () => "S");
    expect(validateAnswer(P, "BFS", { sequence: long }).ok).toBe(false);
  });

  it("accepts well-formed IDS iterations", () => {
    const r = validateAnswer(P, "IDS", {
      iterations: [
        { limit: 0, sequence: ["S"] },
        { limit: 1, sequence: ["S", "A", "B", "C"] },
      ],
    });
    expect(r.ok).toBe(true);
  });

  it("rejects IDS answers sent in the wrong shape", () => {
    expect(validateAnswer(P, "IDS", { sequence: ["S"] }).ok).toBe(false);
  });

  it("rejects an invalid depth limit", () => {
    expect(validateAnswer(P, "IDS", { iterations: [{ limit: -1, sequence: ["S"] }] }).ok).toBe(false);
    expect(validateAnswer(P, "IDS", { iterations: [{ limit: 1.5, sequence: ["S"] }] }).ok).toBe(false);
    expect(validateAnswer(P, "IDS", { iterations: [{ sequence: ["S"] }] }).ok).toBe(false);
  });

  it("rejects an unknown node inside an iteration", () => {
    const r = validateAnswer(P, "IDS", { iterations: [{ limit: 0, sequence: ["Q"] }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("L=0");
  });

  it("accepts an empty sequence, so drafts can be autosaved", () => {
    expect(validateAnswer(P, "BFS", { sequence: [] }).ok).toBe(true);
  });
});

describe("answerIsEmpty", () => {
  it("recognises nothing submitted", () => {
    expect(answerIsEmpty({ sequence: [] })).toBe(true);
    expect(answerIsEmpty({ iterations: [{ limit: 0, sequence: [] }] })).toBe(true);
  });

  it("recognises something submitted", () => {
    expect(answerIsEmpty({ sequence: ["S"] })).toBe(false);
    expect(answerIsEmpty({ iterations: [{ limit: 0, sequence: [] }, { limit: 1, sequence: ["S"] }] })).toBe(false);
  });
});

describe("input hygiene", () => {
  it("trims, collapses whitespace and caps length", () => {
    expect(cleanText("  Ahad   Almasoudi  ", 80)).toBe("Ahad Almasoudi");
    expect(cleanText("x".repeat(200), 40)).toHaveLength(40);
    expect(cleanText(42, 10)).toBe("");
    expect(cleanText(undefined, 10)).toBe("");
  });

  it("only accepts known strategies", () => {
    expect(isStrategy("UCS")).toBe(true);
    expect(isStrategy("DLS")).toBe(true);
    expect(isStrategy("A*")).toBe(false);
    expect(isStrategy(null)).toBe(false);
  });
});
