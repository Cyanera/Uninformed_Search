"use client";

import { cx } from "@/components/ui";
import type { NodeId } from "@/lib/search/types";
import type { SequenceScore } from "@/lib/search/scoring";

/**
 * Expected vs submitted, aligned position by position.
 *
 * Correctness is never carried by colour alone: every cell also carries a mark
 * and a screen-reader label, and the first divergence is called out in words.
 */
export function SequenceDiff({
  score,
  label = "sequence",
  compact = false,
}: {
  score: SequenceScore;
  label?: string;
  compact?: boolean;
}) {
  const length = Math.max(score.expected.length, score.actual.length);
  const positions = Array.from({ length }, (_, i) => i);

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="border-collapse text-sm">
          <caption className="sr-only">Expected and submitted {label}, position by position.</caption>
          <tbody>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-paper pr-3 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                Position
              </th>
              {positions.map((i) => (
                <td key={i} className="px-0.5 pb-1 text-center tabular text-[11px] text-ink-faint">
                  {i + 1}
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-paper pr-3 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                Expected
              </th>
              {positions.map((i) => (
                <td key={i} className="px-0.5">
                  <Cell node={score.expected[i]} tone="expected" compact={compact} />
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-paper pr-3 text-left text-xs font-medium uppercase tracking-wide text-ink-muted">
                Student
              </th>
              {positions.map((i) => {
                const actual = score.actual[i];
                const match = actual !== undefined && actual === score.expected[i];
                return (
                  <td key={i} className="px-0.5">
                    <Cell
                      node={actual}
                      tone={actual === undefined ? "empty" : match ? "match" : "mismatch"}
                      compact={compact}
                    />
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {score.exactMatch ? (
        <p className="text-sm font-medium text-goal">Exact match.</p>
      ) : (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 rounded border border-line bg-canvas px-3 py-2 text-sm">
          <div>
            <dt className="inline text-ink-muted">First divergence: </dt>
            <dd className="inline font-semibold">
              {score.firstDivergenceIndex === null ? "—" : `Position ${score.firstDivergenceIndex + 1}`}
            </dd>
          </div>
          <div>
            <dt className="inline text-ink-muted">Expected: </dt>
            <dd className="inline font-mono font-semibold">{score.expectedAtDivergence ?? "—"}</dd>
          </div>
          <div>
            <dt className="inline text-ink-muted">Student selected: </dt>
            <dd className="inline font-mono font-semibold">
              {score.actualAtDivergence ?? "nothing (sequence ended)"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function Cell({
  node,
  tone,
  compact,
}: {
  node: NodeId | undefined;
  tone: "expected" | "match" | "mismatch" | "empty";
  compact: boolean;
}) {
  const styles = {
    expected: "border-line-strong bg-canvas text-ink",
    match: "border-goal-line bg-goal-soft text-goal",
    mismatch: "border-[#E7B7B2] bg-[#FEF3F2] text-[#B42318]",
    empty: "border-dashed border-line bg-paper text-ink-faint",
  }[tone];

  const srLabel = { expected: "expected", match: "correct", mismatch: "incorrect", empty: "missing" }[tone];
  const mark = { expected: "", match: "✓", mismatch: "✗", empty: "" }[tone];

  return (
    <span
      className={cx(
        "flex items-center justify-center rounded border font-mono font-semibold",
        compact ? "h-8 w-8 text-sm" : "h-10 w-10 text-base",
        styles,
      )}
    >
      <span className="sr-only">{srLabel}: </span>
      {node ?? "·"}
      {mark && (
        <span aria-hidden className="ml-0.5 text-[9px]">
          {mark}
        </span>
      )}
    </span>
  );
}
