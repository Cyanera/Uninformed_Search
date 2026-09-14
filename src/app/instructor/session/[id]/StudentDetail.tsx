"use client";

import { Badge, Button, Card, Notice } from "@/components/ui";
import { formatPercent } from "@/lib/search/scoring";
import { STRATEGY_NAMES } from "@/lib/search/types";
import { formatDuration } from "@/lib/timer";
import type { StudentResult } from "@/lib/analysis";
import { DEFAULT_TOTAL_MARKS, formatMarks, gradeStudent } from "@/lib/grading";
import type { PublicSession, SubmissionRow } from "@/lib/types";
import { SequenceDiff } from "./SequenceDiff";

/**
 * One student, in full: what they did, where it first diverged from the correct
 * search process, and what that might mean.
 */
export function StudentDetail({
  session,
  result,
  submissions,
  onBack,
}: {
  session: PublicSession;
  result: StudentResult;
  submissions: SubmissionRow[];
  onBack: () => void;
}) {
  const { participant } = result;
  const mine = submissions.filter((s) => s.participant_id === participant.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button size="sm" onClick={onBack}>
            &larr; Back to the list
          </Button>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">{participant.name}</h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            <span className="font-mono">{participant.student_number}</span> · joined{" "}
            {new Date(participant.joined_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Mark</dt>
            <dd className="tabular text-2xl font-semibold">
              {formatMarks(gradeStudent(result).marks)}
              <span className="text-base font-normal text-ink-muted"> / {DEFAULT_TOTAL_MARKS}</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Strategies exact</dt>
            <dd className="tabular text-2xl font-semibold">
              {result.exactCount}/{result.strategies.length}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Mean accuracy</dt>
            <dd className="tabular text-2xl font-semibold">{formatPercent(result.averageAccuracy)}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-ink-muted">Completion time</dt>
            <dd className="tabular text-2xl font-semibold">
              {result.completionSeconds === null ? "—" : formatDuration(result.completionSeconds)}
            </dd>
          </div>
        </dl>
      </div>

      {result.isLate && <Notice tone="warn" title="Late submission">Submitted after the timer reached zero.</Notice>}

      {result.strategies.map((entry) => {
        const attempts = mine.filter((s) => s.strategy === entry.strategy);
        return (
          <Card
            key={entry.strategy}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {entry.strategy}
                <span className="font-normal text-ink-muted">{STRATEGY_NAMES[entry.strategy]}</span>
              </span>
            }
            actions={
              <span className="flex flex-wrap items-center gap-2">
                {entry.status === "submitted" ? (
                  <Badge tone="accent">Submitted</Badge>
                ) : entry.status === "in_progress" ? (
                  <Badge tone="neutral">In progress</Badge>
                ) : (
                  <Badge tone="muted">Not started</Badge>
                )}
                {entry.isLate && <Badge tone="warn">LATE</Badge>}
                {entry.score.exactMatch && <Badge tone="goal">Exact match</Badge>}
              </span>
            }
          >
            {!entry.score.answered ? (
              <p className="text-sm text-ink-muted">No answer submitted for this strategy.</p>
            ) : (
              <div className="space-y-4">
                <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <Stat label="Exact match" value={entry.score.exactMatch ? "Yes" : "No"} />
                  <Stat
                    label="Correct prefix"
                    value={`${entry.score.correctPrefixLength} of ${entry.score.positionsTotal}`}
                  />
                  <Stat
                    label="Positions correct"
                    value={`${entry.score.positionsCorrect}/${entry.score.positionsTotal} (${formatPercent(entry.score.positionAccuracy)})`}
                  />
                  {entry.score.iterations && (
                    <Stat
                      label="Iterations correct"
                      value={`${entry.score.iterationsCorrectCount}/${entry.score.iterationsExpectedCount}`}
                    />
                  )}
                </dl>

                {entry.score.iterations ? (
                  <div className="space-y-4">
                    {entry.score.iterations.map((iteration) => (
                      <div key={iteration.limit}>
                        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                          <span className="rounded bg-canvas px-2 py-0.5 font-mono">L = {iteration.limit}</span>
                          {!iteration.present && <Badge tone="muted">Not submitted</Badge>}
                          {iteration.exactMatch && <Badge tone="goal">Exact</Badge>}
                        </p>
                        <SequenceDiff score={iteration} label={`iteration L=${iteration.limit}`} compact />
                      </div>
                    ))}
                  </div>
                ) : (
                  <SequenceDiff
                    score={{
                      expected: entry.score.expectedFlat,
                      actual: entry.score.actualFlat,
                      exactMatch: entry.score.exactMatch,
                      correctPrefixLength: entry.score.correctPrefixLength,
                      positionsCorrect: entry.score.positionsCorrect,
                      positionAccuracy: entry.score.positionAccuracy,
                      firstDivergenceIndex: entry.score.firstDivergenceIndex,
                      expectedAtDivergence: entry.score.expectedAtDivergence,
                      actualAtDivergence: entry.score.actualAtDivergence,
                      lengthDelta: entry.score.actualFlat.length - entry.score.expectedFlat.length,
                    }}
                    label={`${entry.strategy} search order`}
                  />
                )}

                {entry.misconceptions.length > 0 && (
                  <div className="rounded border border-warn-line bg-warn-soft p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-warn">
                      Possible misconception{entry.misconceptions.length > 1 ? "s" : ""}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {entry.misconceptions.map((m) => (
                        <li key={m.code}>
                          <p className="text-sm font-semibold text-warn">{m.title}</p>
                          <p className="mt-0.5 text-sm leading-snug text-ink-muted">{m.detail}</p>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-ink-muted">
                      Pattern-based hints for you only. They are not shown to the student and are not a
                      diagnosis.
                    </p>
                  </div>
                )}

                {attempts[0]?.updated_at && (
                  <p className="text-xs text-ink-muted">
                    Last changed{" "}
                    {new Date(attempts[0].updated_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                    .
                  </p>
                )}
              </div>
            )}
          </Card>
        );
      })}

      <p className="text-xs text-ink-muted">
        Session problem: {session.problem.name}. Expected answers are computed from this session's frozen
        copy of the state space.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular">{value}</dd>
    </div>
  );
}
