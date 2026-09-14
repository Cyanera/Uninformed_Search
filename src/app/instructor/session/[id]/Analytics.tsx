"use client";

import { Badge, Card, Notice, cx } from "@/components/ui";
import { formatPercent, VERDICT_LABEL, type Verdict } from "@/lib/search/scoring";
import { formatDuration } from "@/lib/timer";
import type { ClassStats, StudentResult } from "@/lib/analysis";
import type { PublicSession } from "@/lib/types";
import { Marks } from "./Marks";

/**
 * Class-wide analytics.
 *
 * The point is not a grade. It is to find the one step where the class's
 * reasoning broke, so the demonstration afterwards can go straight there.
 */
export function Analytics({
  session,
  results,
  stats,
  onSelect,
}: {
  session: PublicSession;
  results: StudentResult[];
  stats: ClassStats;
  onSelect: (participantId: string) => void;
}) {
  if (!results.length) {
    return (
      <div className="rounded border border-line bg-canvas p-8 text-center text-sm text-ink-muted">
        Analytics appear once students have submitted answers.
      </div>
    );
  }

  if (!session.revealResults) {
    return (
      <Notice tone="accent" title="Results are not released yet">
        <p className="mt-1">
          Press <strong>Reveal Results</strong> above to release the answer key and open the class
          analytics. Nothing here is visible to students at any point.
        </p>
      </Notice>
    );
  }

  return (
    <div className="space-y-6">
      {/* The marks sheet comes first: it is what the instructor came for. */}
      <Marks session={session} results={results} onSelect={onSelect} />

      {/* A. Accuracy by strategy ------------------------------------------ */}
      <Card
        title="Accuracy by strategy"
        description="Mean share of positions in the search order that each student placed correctly."
      >
        <ul className="space-y-4">
          {stats.byStrategy.map((s) => (
            <li key={s.strategy}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-baseline gap-2">
                  <span className="font-semibold">{s.strategy}</span>
                  <span className="text-sm text-ink-muted">{s.answered} answered</span>
                </span>
                <span className="tabular text-lg font-semibold">{formatPercent(s.accuracy)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-line" aria-hidden>
                <div className="h-full bg-accent" style={{ width: `${Math.round(s.accuracy * 100)}%` }} />
              </div>
              <p className="mt-1.5 text-sm text-ink-muted">
                Exact match: <strong className="font-semibold text-ink">{s.exactMatches}</strong> of{" "}
                {s.answered} ({formatPercent(s.exactRate)}) · Average correct prefix:{" "}
                <strong className="font-semibold text-ink tabular">
                  {s.averagePrefixLength.toFixed(1)}
                </strong>{" "}
                of {s.expectedLength} steps
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-sm text-ink-muted">
          <strong className="font-semibold text-ink">{stats.fullyCorrect}</strong> of {stats.students}{" "}
          students produced the exact search order for every strategy.
        </p>
      </Card>

      {/* D + E. Where the class went wrong ------------------------------- */}
      <Card
        title="Where the search first went wrong"
        description="The step at which each student's reasoning first diverged, and what they chose instead."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {stats.byStrategy.map((s) => {
            const topError = s.firstErrors[0];
            const worst = s.worstPosition;
            const topWrong = worst?.wrong[0];
            return (
              <div key={s.strategy} className="rounded border border-line p-3">
                <p className="font-semibold">{s.strategy}</p>
                {!topError ? (
                  <p className="mt-2 text-sm text-goal">Nobody diverged. The whole class got this right.</p>
                ) : (
                  <>
                    <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                      <strong className="font-semibold tabular text-ink">
                        {formatPercent(topError.share)}
                      </strong>{" "}
                      first diverged{" "}
                      {topError.afterNode === "(the start)" ? (
                        "at the very first node"
                      ) : (
                        <>
                          after node{" "}
                          <span className="font-mono font-semibold text-ink">{topError.afterNode}</span>
                        </>
                      )}{" "}
                      (position {topError.index + 1}).
                    </p>
                    {worst && topWrong && (
                      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
                        At step {worst.index + 1} the expected node is{" "}
                        <span className="font-mono font-semibold text-ink">{worst.expected}</span>. The most
                        common wrong answer was{" "}
                        <span className="font-mono font-semibold text-ink">{topWrong.node}</span> (
                        {topWrong.count} student{topWrong.count === 1 ? "" : "s"}).
                      </p>
                    )}
                  </>
                )}

                {s.misconceptions.length > 0 && (
                  <ul className="mt-3 space-y-1.5 border-t border-line pt-2">
                    {s.misconceptions.map((m) => (
                      <li key={m.code} className="text-sm">
                        <span className="tabular font-semibold">{m.count}</span>{" "}
                        <span className="text-ink-muted">student{m.count === 1 ? "" : "s"} —</span>{" "}
                        <span className="text-warn">{m.title}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 border-t border-line pt-3 text-xs text-ink-muted">
          Misconception labels are rule-based patterns, not diagnoses, and are never shown to students.
        </p>
      </Card>

      {/* Per-step breakdown ---------------------------------------------- */}
      <Card
        title="Step-by-step class accuracy"
        description="How many students placed each position of the search order correctly."
      >
        <div className="space-y-5">
          {stats.byStrategy.map((s) => (
            <div key={s.strategy}>
              <p className="mb-2 font-semibold">{s.strategy}</p>
              <div className="overflow-x-auto">
                <table className="border-collapse text-sm">
                  <caption className="sr-only">Per-position accuracy for {s.strategy}</caption>
                  <tbody>
                    <tr>
                      <th scope="row" className="pr-3 text-left text-xs uppercase tracking-wide text-ink-muted">
                        Step
                      </th>
                      {s.positions.map((p) => (
                        <td key={p.index} className="px-0.5 text-center tabular text-[11px] text-ink-faint">
                          {p.index + 1}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row" className="pr-3 text-left text-xs uppercase tracking-wide text-ink-muted">
                        Expected
                      </th>
                      {s.positions.map((p) => (
                        <td key={p.index} className="px-0.5 text-center font-mono font-semibold">
                          {p.expected}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <th scope="row" className="pr-3 text-left text-xs uppercase tracking-wide text-ink-muted">
                        Correct
                      </th>
                      {s.positions.map((p) => {
                        const share = p.attempts ? p.correct / p.attempts : 0;
                        return (
                          <td key={p.index} className="px-0.5">
                            <span
                              title={`${p.correct} of ${p.attempts} correct`}
                              className={cx(
                                "flex h-9 w-11 flex-col items-center justify-center rounded border text-[11px] font-semibold tabular",
                                share === 1
                                  ? "border-goal-line bg-goal-soft text-goal"
                                  : share >= 0.5
                                    ? "border-line-strong bg-canvas text-ink"
                                    : "border-[#E7B7B2] bg-[#FEF3F2] text-[#B42318]",
                              )}
                            >
                              {Math.round(share * 100)}%
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* F. Completion time ---------------------------------------------- */}
      <Card title="Completion time" description="Measured from the moment the activity started.">
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Stat label="Finished" value={`${stats.completion.count} of ${stats.students}`} />
          <Stat
            label="Average"
            value={stats.completion.averageSeconds === null ? "—" : formatDuration(stats.completion.averageSeconds)}
          />
          <Stat
            label="Median"
            value={stats.completion.medianSeconds === null ? "—" : formatDuration(stats.completion.medianSeconds)}
          />
          <Stat
            label="Fastest"
            value={stats.completion.fastestSeconds === null ? "—" : formatDuration(stats.completion.fastestSeconds)}
          />
          <Stat
            label="Slowest"
            value={stats.completion.slowestSeconds === null ? "—" : formatDuration(stats.completion.slowestSeconds)}
          />
        </dl>

        {stats.completion.count > 0 && (
          <div className="mt-5 flex items-end gap-2" role="img" aria-label="Distribution of completion times">
            {stats.completion.buckets.map((bucket) => {
              const max = Math.max(...stats.completion.buckets.map((b) => b.count), 1);
              return (
                <div key={bucket.label} className="flex flex-1 flex-col items-center gap-1">
                  <span className="tabular text-xs text-ink-muted">{bucket.count || ""}</span>
                  <div
                    className="w-full rounded-t bg-accent"
                    style={{ height: `${Math.max(bucket.count ? 6 : 2, (bucket.count / max) * 96)}px` }}
                  />
                  <span className="text-center text-[11px] leading-tight text-ink-faint">{bucket.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* G. Student x strategy matrix ------------------------------------ */}
      <Card
        title="Student × strategy"
        description="Click any cell to open that student's actual sequence."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left">
                <th scope="col" className="px-3 py-2 font-semibold">Student</th>
                {session.strategies.map((s) => (
                  <th key={s} scope="col" className="px-2 py-2 text-center font-semibold">{s}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right font-semibold">Mean</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.participant.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <span className="flex items-center gap-2">
                      {r.participant.name}
                      {r.isLate && <Badge tone="warn">LATE</Badge>}
                    </span>
                  </th>
                  {session.strategies.map((strategy) => {
                    const cell = r.byStrategy[strategy];
                    const verdict: Verdict = cell?.verdict ?? "missing";
                    return (
                      <td key={strategy} className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => onSelect(r.participant.id)}
                          className={cx(
                            "inline-flex h-9 w-full min-w-[44px] items-center justify-center rounded border text-xs font-semibold",
                            MATRIX_STYLE[verdict],
                          )}
                        >
                          <span aria-hidden>{MATRIX_MARK[verdict]}</span>
                          <span className="sr-only">
                            {strategy}: {VERDICT_LABEL[verdict]} for {r.participant.name}
                          </span>
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular font-medium">
                    {formatPercent(r.averageAccuracy)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-xs text-ink-muted">
          {(Object.keys(MATRIX_MARK) as Verdict[]).map((v) => (
            <li key={v} className="flex items-center gap-1.5">
              <span className={cx("inline-flex h-5 w-6 items-center justify-center rounded border text-[11px] font-semibold", MATRIX_STYLE[v])}>
                {MATRIX_MARK[v]}
              </span>
              {VERDICT_LABEL[v]}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const MATRIX_STYLE: Record<Verdict, string> = {
  correct: "border-goal-line bg-goal-soft text-goal hover:bg-[#D7F5E7]",
  partial: "border-warn-line bg-warn-soft text-warn hover:bg-[#FBEDD4]",
  incorrect: "border-[#E7B7B2] bg-[#FEF3F2] text-[#B42318] hover:bg-[#FCE7E5]",
  missing: "border-line bg-paper text-ink-faint hover:bg-canvas",
};

const MATRIX_MARK: Record<Verdict, string> = {
  correct: "✓",
  partial: "~",
  incorrect: "✗",
  missing: "–",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="tabular text-xl font-semibold">{value}</dd>
    </div>
  );
}
