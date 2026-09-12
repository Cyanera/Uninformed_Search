"use client";

import { cx } from "@/components/ui";
import type { FrontierEntry, NodeId, Strategy } from "@/lib/search/types";

/**
 * The frontier, drawn the way the data structure actually behaves.
 *
 * A queue and a stack look identical as a list of names; the whole point of the
 * demonstration is that they are not, so each gets its own shape and its own
 * labels for which end is being read.
 */
export function FrontierView({
  strategy,
  entries,
  highlight,
  large,
}: {
  strategy: Strategy;
  entries: FrontierEntry[];
  /** Nodes just added on this step. */
  highlight?: NodeId[];
  large?: boolean;
}) {
  const isNew = (entry: FrontierEntry, i: number) =>
    !!highlight?.includes(entry.node) && i >= entries.length - (highlight?.length ?? 0);

  if (!entries.length) {
    return <p className={cx("text-ink-faint", large ? "text-xl" : "text-sm")}>The frontier is empty.</p>;
  }

  if (strategy === "UCS") {
    return (
      <div className="overflow-x-auto">
        <table className={cx("w-full border-collapse", large ? "text-lg" : "text-sm")}>
          <caption className="sr-only">Priority queue ordered by cumulative path cost</caption>
          <thead>
            <tr className="border-b border-line text-left text-ink-muted">
              <th scope="col" className="py-1.5 pr-4 font-medium">Node</th>
              <th scope="col" className="py-1.5 pr-4 font-medium">g(n)</th>
              <th scope="col" className="py-1.5 font-medium">Path</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr
                key={`${entry.node}-${entry.seq}`}
                className={cx(
                  "border-b border-line last:border-0",
                  i === 0 && "bg-accent-soft",
                  isNew(entry, i) && "bg-warn-soft",
                )}
              >
                <td className="py-1.5 pr-4 font-mono font-semibold">
                  {entry.node}
                  {i === 0 && (
                    <span className={cx("ml-2 font-sans font-medium text-accent", large ? "text-sm" : "text-[11px]")}>
                      next out
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-4 tabular font-semibold">{entry.g}</td>
                <td className="py-1.5 font-mono text-ink-muted">{entry.path.join(" → ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (strategy === "DFS" || strategy === "IDS" || strategy === "DLS") {
    // Stored bottom-first; the top of the stack is the last element, so the
    // display is reversed to put the top where a stack's top belongs.
    const top = [...entries].reverse();
    return (
      <div className={cx("inline-block min-w-[200px]", large && "min-w-[280px]")}>
        <p className={cx("mb-1 font-semibold uppercase tracking-wide text-accent", large ? "text-base" : "text-xs")}>
          ▲ Top of stack — next out
        </p>
        <ol className="divide-y divide-line rounded border border-line-strong">
          {top.map((entry, i) => (
            <li
              key={`${entry.node}-${entry.seq}-${i}`}
              className={cx(
                "flex items-center justify-between gap-4 px-3",
                large ? "py-2.5 text-xl" : "py-1.5 text-sm",
                i === 0 && "bg-accent-soft",
                isNew(entry, entries.length - 1 - i) && "bg-warn-soft",
              )}
            >
              <span className="font-mono font-semibold">{entry.node}</span>
              <span className={cx("text-ink-muted", large ? "text-base" : "text-xs")}>
                depth {entry.depth}
              </span>
            </li>
          ))}
        </ol>
        <p className={cx("mt-1 text-ink-faint", large ? "text-base" : "text-xs")}>▼ Bottom of stack</p>
      </div>
    );
  }

  // BFS: a FIFO queue, read from the front, written at the back.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx("font-semibold uppercase tracking-wide text-accent", large ? "text-base" : "text-xs")}>
        Front →
      </span>
      <ol className="flex flex-wrap items-center gap-1.5">
        {entries.map((entry, i) => (
          <li
            key={`${entry.node}-${entry.seq}`}
            className={cx(
              "flex items-center justify-center rounded border font-mono font-semibold",
              large ? "h-14 w-14 text-2xl" : "h-9 w-9 text-base",
              i === 0
                ? "border-accent bg-accent-soft text-accent"
                : isNew(entry, i)
                  ? "border-warn-line bg-warn-soft text-warn"
                  : "border-line-strong bg-paper",
            )}
          >
            {entry.node}
          </li>
        ))}
      </ol>
      <span className={cx("font-semibold uppercase tracking-wide text-ink-faint", large ? "text-base" : "text-xs")}>
        ← Back
      </span>
    </div>
  );
}
