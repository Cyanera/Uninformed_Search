import type { PublicSession, SessionStatus } from "@/lib/types";

/**
 * Timer maths.
 *
 * The session row stores absolute server timestamps rather than a countdown, so
 * every device derives the same remaining time no matter when it connected or
 * how badly its own clock is set. `serverNowOffset` is the correction a client
 * applies after comparing its own clock to the server's.
 */

export interface TimerState {
  status: SessionStatus;
  /** Seconds left, never negative. */
  remainingSeconds: number;
  elapsedSeconds: number;
  totalSeconds: number;
  /** True once the clock has hit zero on a session that actually started. */
  expired: boolean;
  running: boolean;
}

export function computeTimer(session: PublicSession, nowMs: number): TimerState {
  const total = session.durationSeconds;

  if (session.status === "lobby" || !session.startedAt) {
    return {
      status: session.status,
      remainingSeconds: total,
      elapsedSeconds: 0,
      totalSeconds: total,
      expired: false,
      running: false,
    };
  }

  const startedMs = Date.parse(session.startedAt);
  let elapsedMs = nowMs - startedMs;

  // Time spent paused does not count against the students.
  elapsedMs -= session.accumulatedPauseSeconds * 1000;
  if (session.status === "paused" && session.pausedAt) {
    elapsedMs -= nowMs - Date.parse(session.pausedAt);
  }

  const elapsed = Math.max(0, Math.floor(elapsedMs / 1000));
  const remaining = Math.max(0, total - elapsed);

  return {
    status: session.status,
    remainingSeconds: session.status === "ended" ? 0 : remaining,
    elapsedSeconds: Math.min(elapsed, total),
    totalSeconds: total,
    expired: session.status === "ended" || remaining <= 0,
    running: session.status === "running",
  };
}

/** Whether a student may still change their answers. */
export function submissionsOpen(session: PublicSession, nowMs: number): boolean {
  if (session.allowLate) return session.status !== "lobby";
  const timer = computeTimer(session, nowMs);
  return session.status === "running" && !timer.expired;
}

/** Whether a submission made right now counts as late. */
export function isLateNow(session: PublicSession, nowMs: number): boolean {
  const timer = computeTimer(session, nowMs);
  return timer.expired;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** "1 minute", "2 minutes 30 seconds" — used in prose, not on the clock. */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  const parts: string[] = [];
  if (m) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  if (s) parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 seconds";
}

export const DURATION_PRESETS = [5, 10, 15, 20] as const;
export const DEFAULT_DURATION_SECONDS = 15 * 60;
