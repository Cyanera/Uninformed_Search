import { describe, expect, it } from "vitest";
import { computeTimer, formatClock, formatDuration, isLateNow, submissionsOpen } from "@/lib/timer";
import { normalizeSessionCode, generateSessionCode, isPlausibleCode } from "@/lib/codes";
import { CAMPUS_DELIVERY_ROBOT } from "@/lib/search/problem";
import type { PublicSession } from "@/lib/types";

const T0 = Date.parse("2026-03-01T10:00:00.000Z");
const MIN = 60_000;

function session(overrides: Partial<PublicSession> = {}): PublicSession {
  return {
    id: "s1",
    code: "ABCDE",
    title: "Activity",
    problem: CAMPUS_DELIVERY_ROBOT,
    strategies: ["BFS", "DFS", "IDS", "UCS"],
    durationSeconds: 900,
    status: "running",
    startedAt: new Date(T0).toISOString(),
    pausedAt: null,
    accumulatedPauseSeconds: 0,
    allowLate: false,
    revealResults: false,
    ...overrides,
  };
}

describe("computeTimer", () => {
  it("shows the full duration before the instructor starts", () => {
    const t = computeTimer(session({ status: "lobby", startedAt: null }), T0 + 5 * MIN);
    expect(t.remainingSeconds).toBe(900);
    expect(t.running).toBe(false);
    expect(t.expired).toBe(false);
  });

  it("counts down from the shared start time, not from when a client connected", () => {
    // A student joining 4 minutes late sees 11:00 left, the same as everyone else.
    expect(computeTimer(session(), T0 + 4 * MIN).remainingSeconds).toBe(11 * 60);
  });

  it("does not charge students for time spent paused", () => {
    const s = session({ status: "paused", pausedAt: new Date(T0 + 3 * MIN).toISOString() });
    // Paused at 3:00, now 10:00 wall-clock: still 12:00 left.
    expect(computeTimer(s, T0 + 10 * MIN).remainingSeconds).toBe(12 * 60);
    // The clock does not move while paused.
    expect(computeTimer(s, T0 + 20 * MIN).remainingSeconds).toBe(12 * 60);
  });

  it("resumes where it left off", () => {
    const s = session({ accumulatedPauseSeconds: 7 * 60 });
    expect(computeTimer(s, T0 + 10 * MIN).remainingSeconds).toBe(12 * 60);
  });

  it("never goes below zero", () => {
    const t = computeTimer(session(), T0 + 30 * MIN);
    expect(t.remainingSeconds).toBe(0);
    expect(t.expired).toBe(true);
    expect(t.elapsedSeconds).toBe(900);
  });

  it("reflects added time immediately", () => {
    const t = computeTimer(session({ durationSeconds: 900 + 300 }), T0 + 14 * MIN);
    expect(t.remainingSeconds).toBe(6 * 60);
    expect(t.expired).toBe(false);
  });

  it("treats an ended session as finished whatever the clock says", () => {
    const t = computeTimer(session({ status: "ended" }), T0 + MIN);
    expect(t.remainingSeconds).toBe(0);
    expect(t.expired).toBe(true);
  });
});

describe("submissionsOpen", () => {
  it("is closed in the lobby", () => {
    expect(submissionsOpen(session({ status: "lobby", startedAt: null }), T0)).toBe(false);
  });

  it("is open while running", () => {
    expect(submissionsOpen(session(), T0 + MIN)).toBe(true);
  });

  it("freezes at zero by default", () => {
    expect(submissionsOpen(session(), T0 + 16 * MIN)).toBe(false);
  });

  it("stays open past zero when the instructor allows late submissions", () => {
    expect(submissionsOpen(session({ allowLate: true }), T0 + 16 * MIN)).toBe(true);
  });

  it("stays open after the instructor ends the activity if late is allowed", () => {
    expect(submissionsOpen(session({ allowLate: true, status: "ended" }), T0 + 16 * MIN)).toBe(true);
    expect(submissionsOpen(session({ status: "ended" }), T0 + 16 * MIN)).toBe(false);
  });

  it("is closed while paused", () => {
    expect(submissionsOpen(session({ status: "paused", pausedAt: new Date(T0).toISOString() }), T0 + MIN)).toBe(false);
  });
});

describe("isLateNow", () => {
  it("marks work after the buzzer as late", () => {
    expect(isLateNow(session(), T0 + 5 * MIN)).toBe(false);
    expect(isLateNow(session(), T0 + 15 * MIN)).toBe(true);
    expect(isLateNow(session({ status: "ended" }), T0 + MIN)).toBe(true);
  });
});

describe("formatting", () => {
  it("renders a two-digit countdown", () => {
    expect(formatClock(900)).toBe("15:00");
    expect(formatClock(65)).toBe("01:05");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-5)).toBe("00:00");
  });

  it("renders prose durations", () => {
    expect(formatDuration(900)).toBe("15 minutes");
    expect(formatDuration(60)).toBe("1 minute");
    expect(formatDuration(90)).toBe("1 minute 30 seconds");
  });
});

describe("session codes", () => {
  it("generates readable codes of the right length", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateSessionCode();
      expect(code).toHaveLength(5);
      // No characters that get misread on a projector.
      expect(code).not.toMatch(/[01568OILSBZ]/);
      expect(code).toMatch(/^[A-Z0-9]+$/);
    }
  });

  it("forgives how students actually type a code", () => {
    expect(normalizeSessionCode(" a-b c9 ")).toBe("ABC9");
    expect(normalizeSessionCode("de4f7")).toBe("DE4F7");
    expect(normalizeSessionCode("wxyz2")).toBe("WXYZ2");
  });

  it("rejects obviously wrong input", () => {
    expect(isPlausibleCode("AB")).toBe(false);
    expect(isPlausibleCode("ABCDE")).toBe(true);
    expect(isPlausibleCode("ABCDEFGHIJ")).toBe(false);
  });
});
