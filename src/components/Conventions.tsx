"use client";

import type { Strategy } from "@/lib/search/types";
import { Badge } from "./ui";

/**
 * The rules the activity is graded against, stated in front of the student
 * while they answer. Fairness depends on everyone using one convention, so it
 * is never hidden behind a help link.
 */

const GENERAL = [
  "Record the order in which nodes are REMOVED from the frontier and goal-tested.",
  "Children are expanded left to right.",
  "Include the goal node in your sequence.",
  "This is the SEARCH ORDER, not the final path to the goal.",
];

const PER_STRATEGY: Record<Strategy, string[]> = {
  BFS: [
    "FIFO queue: the node that has waited longest is processed first.",
    "Finish a whole level before starting the next one.",
    "Goal test happens when a node is removed from the queue.",
  ],
  DFS: [
    "LIFO stack: the most recently added node is processed first.",
    "Follow the leftmost child as deep as it goes, then backtrack.",
    "Goal test happens when a node is removed from the stack.",
  ],
  IDS: [
    "Run a depth-limited search again and again: L = 0, then 1, then 2, ...",
    "Restart from the start node at every new depth limit.",
    "Repeated nodes are expected — write them down every time.",
    "A node AT the depth limit is still goal-tested, but its children are not generated.",
  ],
  UCS: [
    "Priority queue ordered by cumulative path cost g(n), not by edge cost.",
    "Expand the node with the smallest g(n).",
    "Goal test ONLY when the goal is removed from the queue — not when it is generated.",
    "Ties: lower cost first, then whichever entered the queue earlier.",
  ],
  DLS: [
    "Depth-first search that never goes deeper than the fixed limit L.",
    "A node AT the limit is goal-tested, but its children are not generated.",
  ],
};

export function Conventions({ strategy }: { strategy?: Strategy }) {
  const rules = strategy ? PER_STRATEGY[strategy] : GENERAL;
  return (
    <div className="rounded border border-line bg-canvas p-3">
      <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {strategy ? `${strategy} rules` : "Rules for every strategy"}
        {strategy && <Badge tone="accent">{strategy}</Badge>}
      </p>
      <ul className="space-y-1.5 text-sm leading-snug text-ink-muted">
        {rules.map((rule) => (
          <li key={rule} className="flex gap-2">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { PER_STRATEGY as STRATEGY_RULES, GENERAL as GENERAL_RULES };
