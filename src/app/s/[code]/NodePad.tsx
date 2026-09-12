"use client";

import type { NodeId } from "@/lib/search/types";
import { cx } from "@/components/ui";

/**
 * Node buttons rather than a text field.
 *
 * Students tap; they never type. That removes spelling and case mistakes from
 * the data entirely, so a wrong answer always means a wrong idea about the
 * search, which is the only thing worth measuring here.
 */
export function NodePad({
  nodes,
  onPick,
  disabled,
  label = "Add the next node that is processed",
}: {
  nodes: NodeId[];
  onPick: (node: NodeId) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</p>
      <div className="flex flex-wrap gap-2">
        {nodes.map((node) => (
          <button
            key={node}
            type="button"
            onClick={() => onPick(node)}
            disabled={disabled}
            aria-label={`Add node ${node}`}
            className={cx(
              "min-h-[52px] min-w-[52px] rounded border border-line-strong bg-paper px-3",
              "font-mono text-lg font-semibold text-ink transition-colors",
              "hover:border-accent hover:bg-accent-soft hover:text-accent",
              "active:bg-accent active:text-white",
              "disabled:cursor-not-allowed disabled:border-line disabled:bg-canvas disabled:text-ink-faint",
            )}
          >
            {node}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Numbered chips showing the sequence built so far. */
export function SequenceChips({
  sequence,
  emptyText = "No nodes selected yet.",
  className,
}: {
  sequence: NodeId[];
  emptyText?: string;
  className?: string;
}) {
  if (!sequence.length) {
    return <p className={cx("text-sm text-ink-faint", className)}>{emptyText}</p>;
  }

  return (
    <ol className={cx("flex flex-wrap items-center gap-2", className)}>
      {sequence.map((node, i) => (
        <li
          key={`${node}-${i}`}
          className="inline-flex items-center gap-1.5 rounded border border-line-strong bg-canvas py-1 pl-1.5 pr-2.5"
        >
          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-sm bg-ink px-1 text-[11px] font-semibold tabular text-white">
            {i + 1}
          </span>
          <span className="font-mono text-base font-semibold">{node}</span>
        </li>
      ))}
    </ol>
  );
}
