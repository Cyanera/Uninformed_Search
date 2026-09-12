"use client";

import { Badge, cx } from "@/components/ui";
import { CELL_STATUS_LABEL, type CellStatus, type StudentResult } from "@/lib/analysis";
import { VERDICT_LABEL, type Verdict } from "@/lib/search/scoring";
import type { PublicSession } from "@/lib/types";

/**
 * The live board.
 *
 * Before results are revealed the strategy cells show progress only — never
 * correctness — so the projector can stay on screen during the activity
 * without leaking anything.
 */

const STATUS_STYLE: Record<CellStatus, string> = {
  not_started: "bg-paper text-ink-faint border-line",
  in_progress: "bg-canvas text-ink-muted border-line-strong",
  submitted: "bg-accent-soft text-accent border-accent-line",
};

const VERDICT_STYLE: Record<Verdict, string> = {
  correct: "bg-goal-soft text-goal border-goal-line",
  partial: "bg-warn-soft text-warn border-warn-line",
  incorrect: "bg-[#FEF3F2] text-[#B42318] border-[#E7B7B2]",
  missing: "bg-paper text-ink-faint border-line",
};

const VERDICT_MARK: Record<Verdict, string> = {
  correct: "✓",
  partial: "~",
  incorrect: "✗",
  missing: "–",
};

export function LiveTable({
  session,
  results,
  onSelect,
}: {
  session: PublicSession;
  results: StudentResult[];
  onSelect: (participantId: string) => void;
}) {
  const reveal = session.revealResults;

  if (!results.length) {
    return (
      <div className="rounded border border-line bg-canvas p-8 text-center">
        <p className="text-sm font-medium">No students have joined yet.</p>
        <p className="mt-1 text-sm text-ink-muted">
          They appear here the moment they enter code{" "}
          <span className="font-mono font-semibold">{session.code}</span>.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-line">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <caption className="sr-only">
          Live student progress. {reveal ? "Results are revealed." : "Correctness is hidden until results are revealed."}
        </caption>
        <thead>
          <tr className="border-b border-line bg-canvas text-left">
            <th scope="col" className="px-3 py-2.5 font-semibold">Student name</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Student ID</th>
            {session.strategies.map((s) => (
              <th key={s} scope="col" className="px-3 py-2.5 text-center font-semibold">{s}</th>
            ))}
            <th scope="col" className="px-3 py-2.5 font-semibold">Progress</th>
            <th scope="col" className="px-3 py-2.5 font-semibold">Submitted at</th>
          </tr>
        </thead>
        <tbody>
          {results.map((result) => (
            <tr
              key={result.participant.id}
              onClick={() => onSelect(result.participant.id)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(result.participant.id);
                }
              }}
              className="cursor-pointer border-b border-line last:border-0 hover:bg-canvas focus:bg-canvas focus:outline-none focus-visible:outline-2 focus-visible:outline-accent"
            >
              <th scope="row" className="px-3 py-2.5 text-left font-medium">
                <span className="flex flex-wrap items-center gap-2">
                  {result.participant.name}
                  {result.isLate && <Badge tone="warn">LATE</Badge>}
                </span>
              </th>
              <td className="px-3 py-2.5 font-mono text-ink-muted">{result.participant.student_number}</td>

              {session.strategies.map((strategy) => {
                const cell = result.byStrategy[strategy];
                const verdict = cell?.verdict ?? "missing";
                const status = cell?.status ?? "not_started";
                return (
                  <td key={strategy} className="px-3 py-2.5 text-center">
                    <span
                      className={cx(
                        "inline-flex min-w-[92px] items-center justify-center gap-1.5 rounded border px-2 py-1 text-xs font-medium",
                        reveal ? VERDICT_STYLE[verdict] : STATUS_STYLE[status],
                      )}
                    >
                      {reveal ? (
                        <>
                          <span aria-hidden className="font-mono">{VERDICT_MARK[verdict]}</span>
                          {VERDICT_LABEL[verdict]}
                        </>
                      ) : (
                        CELL_STATUS_LABEL[status]
                      )}
                    </span>
                  </td>
                );
              })}

              <td className="px-3 py-2.5">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-1.5 w-16 overflow-hidden rounded-full bg-line"
                  >
                    <span
                      className="block h-full bg-accent"
                      style={{
                        width: `${(result.submittedCount / Math.max(1, session.strategies.length)) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="tabular text-ink-muted">
                    {result.submittedCount}/{session.strategies.length}
                  </span>
                </span>
              </td>

              <td className="px-3 py-2.5 tabular text-ink-muted">
                {result.finalSubmittedAt
                  ? new Date(result.finalSubmittedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
