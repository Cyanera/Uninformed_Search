"use client";

import { useState } from "react";
import { Button, cx } from "@/components/ui";
import type { NodeId, StrategyAnswer } from "@/lib/search/types";
import { NodePad, SequenceChips } from "./NodePad";

interface Iteration {
  limit: number;
  sequence: NodeId[];
}

/**
 * Answer builder for iterative deepening.
 *
 * Each depth limit is its own row, so repeated visits to the upper levels are
 * represented naturally rather than being something a student has to remember
 * to type. The student never writes "L=0" — the interface owns the limits.
 */
export function IdsBuilder({
  answer,
  nodes,
  startNode,
  disabled,
  onChange,
}: {
  answer: StrategyAnswer;
  nodes: NodeId[];
  startNode: NodeId;
  disabled?: boolean;
  onChange: (answer: StrategyAnswer) => void;
}) {
  const iterations: Iteration[] =
    "iterations" in answer && answer.iterations.length ? answer.iterations : [{ limit: 0, sequence: [] }];

  const [activeIndex, setActiveIndex] = useState(Math.max(0, iterations.length - 1));
  const index = Math.min(activeIndex, iterations.length - 1);
  const activeIteration = iterations[index];

  const set = (next: Iteration[]) => onChange({ iterations: next });

  const updateActive = (sequence: NodeId[]) =>
    set(iterations.map((it, i) => (i === index ? { ...it, sequence } : it)));

  const addIteration = () => {
    const nextLimit = (iterations.at(-1)?.limit ?? -1) + 1;
    set([...iterations, { limit: nextLimit, sequence: [] }]);
    setActiveIndex(iterations.length);
  };

  const removeLast = () => {
    if (iterations.length <= 1) return;
    set(iterations.slice(0, -1));
    setActiveIndex(Math.max(0, iterations.length - 2));
  };

  return (
    <div className="space-y-4 rounded border border-line bg-paper p-4">
      <p className="text-sm text-ink-muted">
        Build the search order for each depth limit separately. Every iteration restarts from{" "}
        <span className="font-mono font-semibold text-ink">{startNode}</span>, so nodes will repeat — that is
        expected.
      </p>

      <ol className="space-y-2">
        {iterations.map((iteration, i) => {
          const selected = i === index;
          return (
            <li key={iteration.limit}>
              <button
                type="button"
                onClick={() => setActiveIndex(i)}
                aria-current={selected ? "true" : undefined}
                className={cx(
                  "w-full rounded border px-3 py-2.5 text-left transition-colors",
                  selected
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-paper hover:border-line-strong hover:bg-canvas",
                )}
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    className={cx(
                      "shrink-0 rounded px-2 py-0.5 font-mono text-sm font-semibold",
                      selected ? "bg-accent text-white" : "bg-canvas text-ink-muted",
                    )}
                  >
                    L = {iteration.limit}
                  </span>
                  {selected && (
                    <span className="text-[11px] font-medium uppercase tracking-wide text-accent">
                      Editing
                    </span>
                  )}
                </span>
                <span className="mt-2 block">
                  <SequenceChips
                    sequence={iteration.sequence}
                    emptyText={selected ? "Tap nodes below." : "Empty — tap to edit."}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <NodePad
        nodes={nodes}
        disabled={disabled}
        label={`Add the next node processed at L = ${activeIteration.limit}`}
        onPick={(node) => updateActive([...activeIteration.sequence, node])}
      />

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" variant="primary" onClick={addIteration} disabled={disabled}>
          Add Next Depth Limit
        </Button>
        <Button
          size="sm"
          onClick={() => updateActive(activeIteration.sequence.slice(0, -1))}
          disabled={disabled || !activeIteration.sequence.length}
        >
          Undo last
        </Button>
        <Button
          size="sm"
          onClick={() => updateActive([])}
          disabled={disabled || !activeIteration.sequence.length}
        >
          Clear L = {activeIteration.limit}
        </Button>
        <Button size="sm" variant="danger" onClick={removeLast} disabled={disabled || iterations.length <= 1}>
          Remove last depth limit
        </Button>
      </div>
    </div>
  );
}
