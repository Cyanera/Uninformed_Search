"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { GraphView, GraphLegend } from "@/components/GraphView";
import { Badge, Button, Notice, cx } from "@/components/ui";
import { runStrategy } from "@/lib/search/algorithms";
import { STRATEGY_NAMES, type NodeId, type Strategy, type TraceStep } from "@/lib/search/types";
import type { PublicSession } from "@/lib/types";
import { FrontierView } from "./FrontierView";

/**
 * Teach Mode: the instructor works the same state space on the projector,
 * one step at a time, after the students have finished.
 *
 * The emphasis throughout is the SEARCH ORDER. The final solution path is
 * treated as a separate, secondary reveal and stays locked while students are
 * still working.
 */
export function TeachMode({
  session,
  projector = false,
  onEnterProjector,
  onExitProjector,
}: {
  session: PublicSession;
  projector?: boolean;
  onEnterProjector?: () => void;
  onExitProjector?: () => void;
}) {
  const [strategy, setStrategy] = useState<Strategy>(session.strategies[0] ?? "BFS");
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false); // off by default, on purpose
  const [showPath, setShowPath] = useState(false);

  const result = useMemo(() => runStrategy(session.problem, strategy), [session.problem, strategy]);
  const steps = result.steps;
  const step: TraceStep | undefined = steps[index];
  const last = steps.length - 1;

  // The answer stays locked while the class might still be working on it.
  const pathUnlocked = session.revealResults || session.status === "ended";

  const reset = useCallback(() => {
    setIndex(0);
    setAutoPlay(false);
    setShowPath(false);
  }, []);

  const next = useCallback(() => setIndex((i) => Math.min(last, i + 1)), [last]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    reset();
    setStarted(false);
  }, [strategy, reset]);

  useEffect(() => {
    if (!autoPlay || !started) return;
    if (index >= last) {
      setAutoPlay(false);
      return;
    }
    const id = window.setTimeout(next, 2200);
    return () => window.clearTimeout(id);
  }, [autoPlay, started, index, last, next]);

  // Arrow keys drive the demonstration from the lectern.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, next, prev]);

  /* ------------------------------------------------------------- derived */

  const processed = step?.processedSoFar ?? [];
  const generated = step?.generated.map((g) => g.node) ?? [];
  const frontierNodes = (step?.frontierAfter ?? []).map((e) => e.node);
  const idsHistory = useMemo(() => buildIdsHistory(steps, index), [steps, index]);

  // For IDS the "order so far" that matters is the current iteration.
  const orderSoFar = strategy === "IDS" ? (idsHistory.at(-1)?.sequence ?? []) : processed;

  if (!started) {
    return (
      <div className="space-y-5">
        <div className="rounded border border-line bg-paper p-5">
          <h2 className="text-lg font-semibold tracking-tight">Teach Mode</h2>
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-muted">
            Work the same state space on the classroom screen, one step at a time. Each step shows the
            frontier before and after, the node being processed, the children it generates, and the search
            order so far.
          </p>

          <fieldset className="mt-5">
            <legend className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              Choose a strategy
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {session.strategies.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStrategy(s)}
                  aria-pressed={strategy === s}
                  className={cx(
                    "min-h-[52px] rounded border px-4 text-left transition-colors",
                    strategy === s
                      ? "border-accent bg-accent-soft"
                      : "border-line-strong bg-paper hover:bg-canvas",
                  )}
                >
                  <span className={cx("block font-semibold", strategy === s && "text-accent")}>{s}</span>
                  <span className="block text-xs text-ink-muted">{STRATEGY_NAMES[s]}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => setStarted(true)}>
              Start Demonstration
            </Button>
            {onEnterProjector && (
              <Button
                size="lg"
                onClick={() => {
                  setStarted(true);
                  onEnterProjector();
                }}
              >
                Start in Projector Mode
              </Button>
            )}
          </div>

          {!pathUnlocked && (
            <p className="mt-4 text-xs text-ink-muted">
              The final solution path stays locked until you reveal results or end the activity.
            </p>
          )}
        </div>
      </div>
    );
  }

  const big = projector;

  return (
    <div className={cx(projector && "fixed inset-0 z-50 overflow-y-auto bg-paper p-6 sm:p-10")}>
      {/* ----------------------------------------------------- step header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={cx("font-semibold uppercase tracking-wide text-ink-muted", big ? "text-base" : "text-xs")}>
            {STRATEGY_NAMES[strategy]}
          </p>
          <h2 className={cx("font-semibold tracking-tight", big ? "text-4xl" : "text-xl")}>
            Step {index + 1} of {steps.length}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          {strategy === "IDS" && step?.limit !== undefined && (
            <span
              className={cx(
                "rounded border border-accent bg-accent-soft px-3 py-1 font-mono font-semibold text-accent",
                big ? "text-2xl" : "text-sm",
              )}
            >
              L = {step.limit}
            </span>
          )}
          {projector ? (
            <Button size={big ? "lg" : "md"} onClick={onExitProjector}>
              Exit Projector Mode
            </Button>
          ) : (
            <>
              {onEnterProjector && <Button onClick={onEnterProjector}>Projector Mode</Button>}
              <Button
                onClick={() => {
                  setStarted(false);
                  reset();
                }}
              >
                Change strategy
              </Button>
            </>
          )}
        </div>
      </div>

      {/* --------------------------------------------------------- controls */}
      <div className="mt-4 flex flex-wrap items-center gap-2 no-print">
        <Button size={big ? "lg" : "md"} onClick={prev} disabled={index === 0}>
          ← Previous Step
        </Button>
        <Button size={big ? "lg" : "md"} variant="primary" onClick={next} disabled={index >= last}>
          Next Step →
        </Button>
        <Button size={big ? "lg" : "md"} onClick={reset} disabled={index === 0 && !showPath}>
          Reset
        </Button>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-ink-muted">Go to step</span>
          <select
            value={index}
            onChange={(e) => setIndex(Number(e.target.value))}
            className="min-h-[44px] rounded border border-line-strong bg-paper px-2 text-sm"
          >
            {steps.map((s, i) => (
              <option key={i} value={i}>
                {i + 1}. {describeStep(s)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-h-[44px] items-center gap-2 rounded border border-line-strong px-3 text-sm">
          <input
            type="checkbox"
            checked={autoPlay}
            onChange={(e) => setAutoPlay(e.target.checked)}
            className="h-4 w-4 accent-[#1D4ED8]"
          />
          Auto play
        </label>
      </div>

      {/* ------------------------------------------------------------ body */}
      <div className={cx("mt-5 grid gap-5", big ? "lg:grid-cols-[1.1fr,1fr]" : "lg:grid-cols-2")}>
        {/* Graph */}
        <section className="rounded border border-line bg-paper p-4">
          <GraphView
            problem={session.problem}
            showOrdinals
            caption={!big}
            highlight={{
              current: step?.current ?? null,
              frontier: frontierNodes,
              processed: orderSoFar,
              generated,
              solutionPath: showPath ? result.solutionPath : null,
            }}
          />
          <GraphLegend className="mt-3 border-t border-line pt-3" />
        </section>

        {/* Narration and frontier */}
        <div className="space-y-4">
          {step?.kind === "iteration-start" || step?.kind === "iteration-end" ? (
            <div
              className={cx(
                "rounded border border-accent-line bg-accent-soft p-4",
                big ? "text-2xl leading-relaxed" : "text-base",
              )}
            >
              <p className="font-semibold text-accent">{step.note}</p>
            </div>
          ) : (
            <>
              <section className="rounded border border-line bg-paper p-4">
                <p className={cx("font-medium uppercase tracking-wide text-ink-muted", big ? "text-base" : "text-xs")}>
                  Now processing
                </p>
                <p className={cx("mt-1 font-mono font-semibold", big ? "text-6xl" : "text-3xl")}>
                  {step?.current ?? "—"}
                </p>
                {strategy === "UCS" && step?.currentG !== undefined && (
                  <p className={cx("mt-1 text-ink-muted", big ? "text-2xl" : "text-sm")}>
                    removed from the queue with g = <strong className="text-ink">{step.currentG}</strong>
                  </p>
                )}
                {step?.isGoal && (
                  <Badge tone="goal" className={big ? "mt-3 text-lg" : "mt-2"}>
                    Goal test succeeds — this is the goal
                  </Badge>
                )}
                {step?.cutoff && (
                  <Badge tone="warn" className={big ? "mt-3 text-lg" : "mt-2"}>
                    At the depth limit — goal-tested but not expanded
                  </Badge>
                )}
                <p className={cx("mt-3 leading-relaxed text-ink-muted", big ? "text-2xl" : "text-sm")}>
                  {step?.note}
                </p>
              </section>

              {/* UCS: the arithmetic, spelled out */}
              {strategy === "UCS" && (step?.generated.length ?? 0) > 0 && (
                <section className="rounded border border-line bg-paper p-4">
                  <p className={cx("font-medium uppercase tracking-wide text-ink-muted", big ? "text-base" : "text-xs")}>
                    Cost of each child
                  </p>
                  <ul className={cx("mt-2 space-y-1 font-mono", big ? "text-2xl" : "text-sm")}>
                    {step!.generated.map((child) => (
                      <li key={child.node} className={cx(child.isGoal && "font-semibold text-goal")}>
                        g({child.node}) = g({child.parent}) + {child.edgeCost} = {child.parentG} +{" "}
                        {child.edgeCost} = <strong>{child.g}</strong>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {/* The single most important warning in the whole activity */}
              {strategy === "UCS" && step?.generated.some((g) => g.isGoal) && (
                <div className={cx("rounded border-2 border-warn-line bg-warn-soft p-4", big && "p-6")}>
                  <p className={cx("font-bold text-warn", big ? "text-3xl" : "text-base")}>
                    {session.problem.goal} has been generated with cost{" "}
                    {step!.generated.find((g) => g.isGoal)!.g} — do NOT stop yet.
                  </p>
                  <p className={cx("mt-2 leading-relaxed text-ink-muted", big ? "text-2xl" : "text-sm")}>
                    Uniform-cost search applies the goal test when {session.problem.goal} is REMOVED from the
                    priority queue, not when it is generated. A cheaper path may still be waiting.
                  </p>
                </div>
              )}

              <section className="rounded border border-line bg-paper p-4">
                <p className={cx("font-medium uppercase tracking-wide text-ink-muted", big ? "text-base" : "text-xs")}>
                  Frontier before expansion
                </p>
                <div className="mt-2">
                  <FrontierView strategy={strategy} entries={step?.frontierBefore ?? []} large={big} />
                </div>
              </section>

              <section className="rounded border border-accent-line bg-accent-soft p-4">
                <p className={cx("font-medium uppercase tracking-wide text-accent", big ? "text-base" : "text-xs")}>
                  Frontier after expansion
                </p>
                <div className="mt-2">
                  <FrontierView
                    strategy={strategy}
                    entries={step?.frontierAfter ?? []}
                    highlight={generated}
                    large={big}
                  />
                </div>
                {generated.length > 0 && (
                  <p className={cx("mt-2 text-ink-muted", big ? "text-xl" : "text-sm")}>
                    Newly generated: {generated.join(", ")}
                  </p>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- search order so far */}
      <section className="mt-5 rounded border border-line bg-paper p-4">
        <p className={cx("font-medium uppercase tracking-wide text-ink-muted", big ? "text-base" : "text-xs")}>
          Search order so far {strategy === "IDS" && "(this iteration)"}
        </p>
        <p className={cx("mt-1 font-mono font-semibold", big ? "text-4xl" : "text-xl")}>
          {orderSoFar.length ? orderSoFar.join(" → ") : "—"}
        </p>
      </section>

      {/* IDS: every iteration stays on screen, repeats included */}
      {strategy === "IDS" && idsHistory.length > 0 && (
        <section className="mt-4 rounded border border-line bg-paper p-4">
          <p className={cx("font-medium uppercase tracking-wide text-ink-muted", big ? "text-base" : "text-xs")}>
            All iterations — notice the repeated nodes
          </p>
          <ol className="mt-2 space-y-1.5">
            {idsHistory.map((iteration, i) => (
              <li key={iteration.limit} className="flex flex-wrap items-baseline gap-3">
                <span
                  className={cx(
                    "rounded px-2 py-0.5 font-mono font-semibold",
                    i === idsHistory.length - 1 ? "bg-accent text-white" : "bg-canvas text-ink-muted",
                    big ? "text-xl" : "text-sm",
                  )}
                >
                  L = {iteration.limit}
                </span>
                <span className={cx("font-mono", big ? "text-2xl" : "text-base")}>
                  {iteration.sequence.join(" → ") || "—"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* ------------------------------------- search order vs solution path */}
      <section className="mt-4 rounded border border-line bg-paper p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className={cx("font-semibold", big ? "text-2xl" : "text-sm")}>
              Search order is not the solution path
            </p>
            <p className={cx("mt-1 max-w-prose text-ink-muted", big ? "text-xl" : "text-sm")}>
              The search order lists every node removed from the frontier, including the ones explored and
              abandoned. The solution path is only the route from {session.problem.start} to{" "}
              {session.problem.goal}.
            </p>
          </div>
          <Button
            size={big ? "lg" : "md"}
            onClick={() => setShowPath((v) => !v)}
            disabled={!pathUnlocked}
            title={pathUnlocked ? undefined : "Locked until you reveal results or end the activity"}
            className="no-print"
          >
            {showPath ? "Hide Final Path" : "Show Final Path"}
          </Button>
        </div>

        {showPath && result.solutionPath && (
          <div className="mt-3 rounded border border-goal-line bg-goal-soft p-3">
            <p className={cx("font-mono font-semibold text-goal", big ? "text-3xl" : "text-lg")}>
              {result.solutionPath.join(" → ")}
            </p>
            <p className={cx("mt-1 text-goal", big ? "text-xl" : "text-sm")}>
              Total cost: {result.solutionCost}
            </p>
          </div>
        )}

        {!pathUnlocked && (
          <Notice tone="neutral">
            The final path is hidden while the activity is live. Reveal results or end the activity to unlock
            it.
          </Notice>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- helpers */

function describeStep(step: TraceStep): string {
  if (step.kind === "iteration-start") return `Start L = ${step.limit}`;
  if (step.kind === "iteration-end") return `End L = ${step.limit}`;
  return `Process ${step.current}`;
}

/** Rebuilds the per-iteration sequences visible at a given point in the trace. */
function buildIdsHistory(steps: TraceStep[], upto: number): { limit: number; sequence: NodeId[] }[] {
  const history: { limit: number; sequence: NodeId[] }[] = [];
  for (let i = 0; i <= upto && i < steps.length; i++) {
    const step = steps[i];
    if (step.limit === undefined) continue;
    if (step.kind === "iteration-start") {
      history.push({ limit: step.limit, sequence: [] });
    } else if (step.kind === "expand" && step.current) {
      const current = history.at(-1);
      if (current) current.sequence.push(step.current);
    }
  }
  return history;
}
