/**
 * The demo class, as pure data.
 *
 * Kept free of environment and network access so the test suite can assert that
 * these students really do produce the misconceptions `npm run demo` claims
 * they do. Nothing here is a hand-typed wrong answer: each mistake is generated
 * by the same simulation the marking uses, so the demo cannot drift away from
 * the engine.
 */
import { canonicalAnswer } from "../src/lib/search/algorithms";
import {
  dfsOrder,
  goalOnGenerationOrder,
  idsWithoutRestartIterations,
  solutionPathFor,
} from "../src/lib/search/references";
import type { NodeId, StateSpaceProblem, StrategyAnswer } from "../src/lib/search/types";

export type DemoStrategy = "BFS" | "DFS" | "IDS" | "UCS";

export interface DemoStudent {
  name: string;
  number: string;
  /** Seconds after the start at which they pressed Submit All, or null if never. */
  finishedAfter: number | null;
  late?: boolean;
  answers: Partial<Record<DemoStrategy, StrategyAnswer>>;
  /** Strategies left as an unsubmitted draft. */
  drafts?: DemoStrategy[];
  /** What this student is here to demonstrate. Asserted by the tests. */
  expects?: Partial<Record<DemoStrategy, string[]>>;
  blurb?: string;
}

export const DEMO_DURATION_SECONDS = 15 * 60;

/** A plausible slip: the last two nodes swapped. */
export function swapLast(sequence: NodeId[]): NodeId[] {
  const out = [...sequence];
  if (out.length >= 2) {
    const i = out.length - 2;
    [out[i], out[i + 1]] = [out[i + 1], out[i]];
  }
  return out;
}

export function buildDemoStudents(problem: StateSpaceProblem): DemoStudent[] {
  const wrap = (sequence: NodeId[]): StrategyAnswer => ({ sequence });

  const correctBfs = canonicalAnswer(problem, "BFS");
  const correctDfs = canonicalAnswer(problem, "DFS");
  const correctUcs = canonicalAnswer(problem, "UCS");
  const correctIds = canonicalAnswer(problem, "IDS");

  const bfsAnsweredDepthFirst = wrap(dfsOrder(problem));
  const earlyStopUcs = goalOnGenerationOrder(problem, "UCS");
  const ucsStopsOnGeneration = earlyStopUcs ? wrap(earlyStopUcs) : correctUcs;
  const idsNoRestart: StrategyAnswer = { iterations: idsWithoutRestartIterations(problem) };
  const dfsSolutionPath = wrap(solutionPathFor(problem, "DFS") ?? []);
  const ucsLateSlip = wrap(swapLast((correctUcs as { sequence: NodeId[] }).sequence));

  return [
    {
      name: "Norah Al-Harbi",
      number: "2210045",
      finishedAfter: 250,
      answers: { BFS: correctBfs, DFS: correctDfs, IDS: correctIds, UCS: correctUcs },
      expects: { BFS: [], DFS: [], IDS: [], UCS: [] },
      blurb: "everything correct, fastest in the class",
    },
    {
      name: "Reem Al-Zahrani",
      number: "2210112",
      finishedAfter: 452,
      answers: { BFS: correctBfs, DFS: correctDfs, IDS: correctIds, UCS: correctUcs },
      expects: { BFS: [], DFS: [], IDS: [], UCS: [] },
      blurb: "everything correct",
    },
    {
      name: "Lama Al-Ghamdi",
      number: "2210078",
      finishedAfter: 545,
      answers: { BFS: bfsAnsweredDepthFirst, DFS: correctDfs, IDS: correctIds, UCS: correctUcs },
      expects: { BFS: ["bfs-behaves-like-dfs"], DFS: [] },
      blurb: "answered BFS depth-first",
    },
    {
      name: "Sara Al-Otaibi",
      number: "2210203",
      finishedAfter: 640,
      answers: { BFS: correctBfs, DFS: correctDfs, IDS: correctIds, UCS: ucsStopsOnGeneration },
      expects: { UCS: ["goal-test-on-generation"], BFS: [] },
      blurb: "stopped as soon as G was generated",
    },
    {
      name: "Hessa Al-Qahtani",
      number: "2210156",
      finishedAfter: 733,
      answers: { BFS: correctBfs, DFS: correctDfs, IDS: idsNoRestart, UCS: ucsLateSlip },
      expects: { IDS: ["ids-no-restart", "ids-deduplicated"] },
      blurb: "never restarted IDS from the start node",
    },
    {
      name: "Maha Al-Shehri",
      number: "2210091",
      finishedAfter: 812,
      answers: { BFS: correctBfs, DFS: dfsSolutionPath, IDS: correctIds, UCS: ucsLateSlip },
      expects: { DFS: ["solution-path-not-search-order"] },
      blurb: "submitted the solution path instead of the search order",
    },
    {
      name: "Jood Al-Malki",
      number: "2210187",
      finishedAfter: DEMO_DURATION_SECONDS + 95,
      late: true,
      answers: { BFS: correctBfs, DFS: correctDfs, IDS: idsNoRestart, UCS: ucsStopsOnGeneration },
      expects: { IDS: ["ids-no-restart"], UCS: ["goal-test-on-generation"] },
      blurb: "late, with two of the same mistakes",
    },
    {
      name: "Amal Al-Dossari",
      number: "2210064",
      finishedAfter: null,
      answers: { BFS: correctBfs, DFS: correctDfs, UCS: wrap(["S", "B", "F"]) },
      drafts: ["UCS"],
      blurb: "ran out of time",
    },
  ];
}
