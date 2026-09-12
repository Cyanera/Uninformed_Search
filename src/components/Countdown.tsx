"use client";

import { formatClock } from "@/lib/timer";
import type { TimerState } from "@/lib/timer";
import { cx } from "./ui";

const STATUS_TEXT: Record<TimerState["status"], string> = {
  lobby: "Waiting to start",
  running: "Time remaining",
  paused: "Paused",
  ended: "Finished",
};

/**
 * The countdown. Large, monospaced digits with tabular numbers so the width
 * never shifts, and a written status line so the state is never conveyed by
 * colour alone.
 */
export function Countdown({
  timer,
  size = "md",
  className,
}: {
  timer: TimerState;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}) {
  const digits = {
    sm: "text-2xl",
    md: "text-4xl",
    lg: "text-6xl",
    xl: "text-[7rem] leading-none",
  }[size];

  const urgent = timer.running && timer.remainingSeconds <= 60 && timer.remainingSeconds > 0;
  const done = timer.expired;

  return (
    <div className={cx("flex flex-col items-start", className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">
        {STATUS_TEXT[timer.status]}
      </span>
      <span
        className={cx(
          "tabular font-mono font-semibold tracking-tight",
          digits,
          done ? "text-ink-faint" : urgent ? "text-[#B42318]" : "text-ink",
        )}
        aria-live={urgent ? "polite" : "off"}
      >
        {formatClock(timer.remainingSeconds)}
      </span>
      {timer.status === "paused" && (
        <span className="mt-1 text-xs font-medium text-warn">The clock is stopped.</span>
      )}
      {done && timer.status !== "lobby" && (
        <span className="mt-1 text-xs font-medium text-ink-muted">Time is up.</span>
      )}
    </div>
  );
}
