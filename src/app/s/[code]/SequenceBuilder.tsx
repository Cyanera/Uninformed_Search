"use client";

import { Button } from "@/components/ui";
import type { NodeId, StrategyAnswer } from "@/lib/search/types";
import { NodePad, SequenceChips } from "./NodePad";

/** Answer builder for BFS, DFS, UCS and DLS: one flat processing order. */
export function SequenceBuilder({
  answer,
  nodes,
  disabled,
  onChange,
}: {
  answer: StrategyAnswer;
  nodes: NodeId[];
  disabled?: boolean;
  onChange: (answer: StrategyAnswer) => void;
}) {
  const sequence = "sequence" in answer ? answer.sequence : [];

  const set = (next: NodeId[]) => onChange({ sequence: next });

  return (
    <div className="space-y-4 rounded border border-line bg-paper p-4">
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Your processing order
        </p>
        <SequenceChips sequence={sequence} emptyText="Tap a node below to begin." />
      </div>

      <NodePad nodes={nodes} disabled={disabled} onPick={(node) => set([...sequence, node])} />

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        <Button size="sm" onClick={() => set(sequence.slice(0, -1))} disabled={disabled || !sequence.length}>
          Undo last
        </Button>
        <Button
          size="sm"
          variant="danger"
          onClick={() => set([])}
          disabled={disabled || !sequence.length}
        >
          Clear strategy
        </Button>
      </div>
    </div>
  );
}
