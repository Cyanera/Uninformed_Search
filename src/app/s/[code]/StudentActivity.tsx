"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { GraphView } from "@/components/GraphView";
import { Countdown } from "@/components/Countdown";
import { Conventions } from "@/components/Conventions";
import { useLiveSession } from "@/components/useLiveSession";
import { Badge, Button, Notice, Tabs } from "@/components/ui";
import { clearIdentity, loadIdentity } from "@/lib/identity";
import { submissionsOpen } from "@/lib/timer";
import { STRATEGY_NAMES, type NodeId, type Strategy, type StrategyAnswer } from "@/lib/search/types";
import type { PublicSession, StudentIdentity } from "@/lib/types";
import { SequenceBuilder } from "./SequenceBuilder";
import { IdsBuilder } from "./IdsBuilder";

type SubmitState = { status: "in_progress" | "submitted"; submittedAt: string | null; isLate: boolean };

const AUTOSAVE_DELAY = 1200;

function emptyAnswer(strategy: Strategy): StrategyAnswer {
  return strategy === "IDS" ? { iterations: [{ limit: 0, sequence: [] }] } : { sequence: [] };
}

export function StudentActivity({
  initialSession,
  serverNow: initialServerNow,
}: {
  initialSession: PublicSession;
  serverNow: number;
}) {
  const router = useRouter();
  const { session, timer, serverNow } = useLiveSession(initialSession, initialServerNow);

  const [identity, setIdentity] = useState<StudentIdentity | null>(null);
  const [ready, setReady] = useState(false);
  const [answers, setAnswers] = useState<Record<string, StrategyAnswer>>({});
  const [submitted, setSubmitted] = useState<Record<string, SubmitState>>({});
  const [finalSubmittedAt, setFinalSubmittedAt] = useState<string | null>(null);
  const [active, setActive] = useState<Strategy>(session.strategies[0] ?? "BFS");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = submissionsOpen(session, serverNow);
  const late = timer.expired && session.allowLate;

  /* ---------------------------------------------------------------- load */

  useEffect(() => {
    const stored = loadIdentity();
    if (!stored || stored.sessionId !== session.id) {
      router.replace(`/join?code=${session.code}`);
      return;
    }
    setIdentity(stored);

    (async () => {
      try {
        const res = await fetch("/api/submission", {
          cache: "no-store",
          headers: {
            "x-participant-id": stored.participantId,
            "x-participant-token": stored.clientToken,
          },
        });
        if (res.status === 401) {
          clearIdentity();
          router.replace(`/join?code=${session.code}`);
          return;
        }
        const data = await res.json();
        const nextAnswers: Record<string, StrategyAnswer> = {};
        const nextSubmitted: Record<string, SubmitState> = {};
        for (const row of data.submissions ?? []) {
          nextAnswers[row.strategy] = row.answer_json;
          nextSubmitted[row.strategy] = {
            status: row.status,
            submittedAt: row.submitted_at,
            isLate: row.is_late,
          };
        }
        setAnswers(nextAnswers);
        setSubmitted(nextSubmitted);
        setFinalSubmittedAt(data.finalSubmittedAt ?? null);
      } catch {
        // Start from a blank sheet; autosave will catch up.
      } finally {
        setReady(true);
      }
    })();
  }, [router, session.id, session.code]);

  /* ------------------------------------------------------------ autosave */

  const timers = useRef<Record<string, number>>({});

  const save = useCallback(
    async (strategy: Strategy, answer: StrategyAnswer, status: "in_progress" | "submitted") => {
      if (!identity) return null;
      const res = await fetch("/api/submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participantId: identity.participantId,
          clientToken: identity.clientToken,
          strategy,
          answer,
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save your answer.");
      return data as { status: "in_progress" | "submitted"; submittedAt: string | null; isLate: boolean };
    },
    [identity],
  );

  const updateAnswer = useCallback(
    (strategy: Strategy, answer: StrategyAnswer) => {
      setAnswers((prev) => ({ ...prev, [strategy]: answer }));
      // Editing an answer takes it back to "in progress" until it is submitted
      // again, so the instructor's board always reflects what the student sees.
      setSubmitted((prev) =>
        prev[strategy]?.status === "submitted"
          ? { ...prev, [strategy]: { ...prev[strategy], status: "in_progress" } }
          : prev,
      );

      window.clearTimeout(timers.current[strategy]);
      timers.current[strategy] = window.setTimeout(() => {
        save(strategy, answer, "in_progress").catch(() => {
          /* draft autosave is best-effort; Submit reports real errors */
        });
      }, AUTOSAVE_DELAY);
    },
    [save],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((id) => window.clearTimeout(id));
  }, []);

  /* ------------------------------------------------------------- actions */

  async function submitStrategy(strategy: Strategy) {
    setError(null);
    setBusy(true);
    try {
      window.clearTimeout(timers.current[strategy]);
      const result = await save(strategy, answers[strategy] ?? emptyAnswer(strategy), "submitted");
      if (result) {
        setSubmitted((prev) => ({
          ...prev,
          [strategy]: { status: "submitted", submittedAt: result.submittedAt, isLate: result.isLate },
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAll() {
    if (!identity) return;
    setError(null);
    setBusy(true);
    try {
      // Flush every pending draft before the final submit.
      for (const strategy of session.strategies) {
        window.clearTimeout(timers.current[strategy]);
        await save(strategy, answers[strategy] ?? emptyAnswer(strategy), "submitted");
      }
      const res = await fetch("/api/submission/final", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantId: identity.participantId, clientToken: identity.clientToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit.");
      setFinalSubmittedAt(data.submittedAt);
      setSubmitted((prev) => {
        const next = { ...prev };
        for (const s of session.strategies) {
          next[s] = { status: "submitted", submittedAt: data.submittedAt, isLate: data.isLate };
        }
        return next;
      });
      setConfirming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit.");
    } finally {
      setBusy(false);
    }
  }

  /* -------------------------------------------------------------- derived */

  const hasAnswer = useCallback(
    (strategy: Strategy) => {
      const a = answers[strategy];
      if (!a) return false;
      if ("sequence" in a) return a.sequence.length > 0;
      return a.iterations.some((i) => i.sequence.length > 0);
    },
    [answers],
  );

  const completedCount = useMemo(
    () => session.strategies.filter((s) => submitted[s]?.status === "submitted").length,
    [session.strategies, submitted],
  );

  const allAnswered = session.strategies.every(hasAnswer);
  const nodeIds: NodeId[] = session.problem.nodes.map((n) => n.id);
  const answer = answers[active] ?? emptyAnswer(active);

  if (!ready) {
    return (
      <main className="mx-auto max-w-md px-6 py-24 text-center text-sm text-ink-muted">
        Loading your session…
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:px-6">
      {/* ---------------------------------------------------------- header */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-tight">{session.title}</h1>
            <p className="mt-0.5 truncate text-sm text-ink-muted">
              {identity?.name} · {identity?.studentNumber}
            </p>
          </div>
          <Countdown timer={timer} size="md" />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone={completedCount === session.strategies.length ? "goal" : "neutral"}>
            {completedCount} of {session.strategies.length} strategies submitted
          </Badge>
          {finalSubmittedAt && <Badge tone="goal">All answers submitted</Badge>}
          {late && <Badge tone="warn">Late submission</Badge>}
        </div>
      </header>

      {session.status === "lobby" && (
        <Notice tone="accent" title="Waiting for your instructor to start">
          <p className="mt-1">
            You have joined the session. The timer starts for everybody at the same moment.
          </p>
        </Notice>
      )}

      {timer.expired && !session.allowLate && (
        <Notice tone="warn" title="Time is up">
          Submissions are closed. Your last saved answers have been recorded.
        </Notice>
      )}

      {session.status === "paused" && (
        <Notice tone="warn" title="Paused">The clock is stopped. Wait for your instructor.</Notice>
      )}

      {/* ----------------------------------------------------------- graph */}
      <section className="mt-4 rounded border border-line bg-paper p-4">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">{session.problem.name}</h2>
          <p className="text-xs text-ink-muted">
            Start <span className="font-mono font-semibold text-accent">{session.problem.start}</span> · Goal{" "}
            <span className="font-mono font-semibold text-goal">{session.problem.goal}</span>
          </p>
        </div>
        {session.problem.story && (
          <p className="mb-3 max-w-prose text-sm leading-relaxed text-ink-muted">{session.problem.story}</p>
        )}
        <GraphView problem={session.problem} />
      </section>

      {/* ------------------------------------------------------------ tabs */}
      <div className="mt-6">
        <Tabs
          ariaLabel="Search strategies"
          active={active}
          onChange={setActive}
          tabs={session.strategies.map((s) => ({
            id: s,
            label: s,
            badge:
              submitted[s]?.status === "submitted" ? (
                <span aria-hidden className="text-goal">
                  ✓
                </span>
              ) : hasAnswer(s) ? (
                <span aria-hidden className="text-ink-faint">
                  •
                </span>
              ) : undefined,
          }))}
        />
      </div>

      <div
        role="tabpanel"
        id={`panel-${active}`}
        aria-labelledby={`tab-${active}`}
        className="mt-4 space-y-4"
      >
        <div>
          <h3 className="text-base font-semibold tracking-tight">{STRATEGY_NAMES[active]}</h3>
          <p className="mt-1 max-w-prose text-sm text-ink-muted">
            Tap the nodes in the order they are <strong className="font-semibold text-ink">processed</strong>{" "}
            by the algorithm — that is, the order in which they are removed from the frontier and
            goal-tested. Include the goal node.
          </p>
        </div>

        <Conventions strategy={active} />

        {active === "IDS" ? (
          <IdsBuilder
            answer={answer}
            nodes={nodeIds}
            startNode={session.problem.start}
            disabled={!open}
            onChange={(next) => updateAnswer("IDS", next)}
          />
        ) : (
          <SequenceBuilder
            answer={answer}
            nodes={nodeIds}
            disabled={!open}
            onChange={(next) => updateAnswer(active, next)}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" onClick={() => submitStrategy(active)} disabled={!open || busy || !hasAnswer(active)}>
            Submit {active}
          </Button>
          {submitted[active]?.status === "submitted" && submitted[active]?.submittedAt && (
            <span className="text-sm text-ink-muted">
              Submitted at{" "}
              <time dateTime={submitted[active].submittedAt!} className="tabular font-medium text-ink">
                {new Date(submitted[active].submittedAt!).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </time>
              {submitted[active].isLate && <span className="ml-2 font-medium text-warn">LATE</span>}
            </span>
          )}
        </div>

        {error && <Notice tone="warn">{error}</Notice>}

        <p className="text-xs text-ink-muted">
          You can change your answer and submit again until the timer ends. You will not be told whether an
          answer is correct — results are released by your instructor after the activity.
        </p>
      </div>

      {/* --------------------------------------------------- final submit */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {allAnswered
              ? "Every strategy has an answer."
              : `Answer all ${session.strategies.length} strategies to finish.`}
          </p>
          <Button
            variant="primary"
            size="lg"
            onClick={() => setConfirming(true)}
            disabled={!open || !allAnswered || busy}
          >
            Submit All Answers
          </Button>
        </div>
      </div>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center"
        >
          <div className="w-full max-w-md rounded border border-line bg-paper p-5">
            <h2 id="confirm-title" className="text-base font-semibold tracking-tight">
              Submit all answers?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              You are submitting the <strong className="font-semibold text-ink">SEARCH ORDER</strong> for:{" "}
              {session.strategies.join(", ")}.
            </p>
            <p className="mt-2 text-sm text-ink-muted">
              You can still change your answers until the timer ends.
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button onClick={() => setConfirming(false)} disabled={busy}>
                Go back
              </Button>
              <Button variant="primary" onClick={submitAll} disabled={busy}>
                {busy ? "Submitting…" : "Yes, submit"}
              </Button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
