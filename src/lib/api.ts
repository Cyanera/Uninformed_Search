import { NextResponse } from "next/server";
import type { StateSpaceProblem, Strategy, StrategyAnswer } from "@/lib/search/types";
import { ALL_STRATEGIES } from "@/lib/search/types";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function isStrategy(value: unknown): value is Strategy {
  return typeof value === "string" && (ALL_STRATEGIES as string[]).includes(value);
}

/** Trim and cap free text so a stray paste cannot bloat a row. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

const MAX_EMAIL = 254;

/**
 * Normalize an email address, or null if it is obviously not one. Deliberately
 * permissive — the auth service is the real validator, this only catches the
 * typo before a round trip.
 */
export function cleanEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL) return null;
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return null;
  return email;
}

const MAX_SEQUENCE = 400;
const MAX_ITERATIONS = 24;

/**
 * Validate a submitted answer against the problem the session is actually
 * running. Students answer by tapping buttons, so anything else reaching this
 * function is either a bug or someone poking at the API.
 */
export function validateAnswer(
  problem: StateSpaceProblem,
  strategy: Strategy,
  raw: unknown,
): { ok: true; answer: StrategyAnswer } | { ok: false; error: string } {
  const known = new Set(problem.nodes.map((n) => n.id));

  const checkSequence = (value: unknown, where: string): string[] | string => {
    if (!Array.isArray(value)) return `${where} must be an array of node ids.`;
    if (value.length > MAX_SEQUENCE) return `${where} is too long.`;
    for (const item of value) {
      if (typeof item !== "string") return `${where} contains a non-string entry.`;
      if (!known.has(item)) return `${where} contains "${item}", which is not a node in this problem.`;
    }
    return value as string[];
  };

  if (strategy === "IDS") {
    const iterations = (raw as { iterations?: unknown })?.iterations;
    if (!Array.isArray(iterations)) return { ok: false, error: "IDS answers must contain an `iterations` array." };
    if (iterations.length > MAX_ITERATIONS) return { ok: false, error: "Too many depth limits." };

    const cleaned: { limit: number; sequence: string[] }[] = [];
    for (const [i, iteration] of iterations.entries()) {
      const limit = (iteration as { limit?: unknown })?.limit;
      if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 0 || limit > 50) {
        return { ok: false, error: `Iteration ${i + 1} has an invalid depth limit.` };
      }
      const seq = checkSequence((iteration as { sequence?: unknown })?.sequence, `Iteration L=${limit}`);
      if (typeof seq === "string") return { ok: false, error: seq };
      cleaned.push({ limit, sequence: seq });
    }
    return { ok: true, answer: { iterations: cleaned } };
  }

  const seq = checkSequence((raw as { sequence?: unknown })?.sequence, "The sequence");
  if (typeof seq === "string") return { ok: false, error: seq };
  return { ok: true, answer: { sequence: seq } };
}

/** Does this answer contain anything at all? */
export function answerIsEmpty(answer: StrategyAnswer): boolean {
  if ("sequence" in answer) return answer.sequence.length === 0;
  return answer.iterations.every((i) => i.sequence.length === 0);
}
