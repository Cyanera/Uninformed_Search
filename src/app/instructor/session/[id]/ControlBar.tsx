"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge, Button, Notice } from "@/components/ui";
import { Countdown } from "@/components/Countdown";
import type { TimerState } from "@/lib/timer";
import type { PublicSession } from "@/lib/types";

/**
 * The controls the instructor uses while standing at the front of the room.
 * Large targets, plain labels, and the session code big enough to read from
 * the back row.
 */
export function ControlBar({
  session,
  timer,
  studentCount,
  submittedCount,
}: {
  session: PublicSession;
  timer: TimerState;
  studentCount: number;
  submittedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/instructor/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "That did not work.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusy(null);
    }
  }

  const running = session.status === "running";
  const paused = session.status === "paused";
  const started = running || paused;

  return (
    <section className="mt-4 rounded border border-line bg-paper">
      <div className="grid gap-6 p-4 sm:grid-cols-[auto,1fr] sm:items-start">
        <div className="flex flex-wrap items-start gap-6">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Session code</p>
            <p className="font-mono text-4xl font-semibold tracking-[0.2em] sm:text-5xl">{session.code}</p>
            <p className="mt-1 text-xs text-ink-muted">Students join at /join</p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">Students</p>
            <p className="tabular text-4xl font-semibold sm:text-5xl">{studentCount}</p>
            <p className="mt-1 text-xs text-ink-muted">{submittedCount} finished</p>
          </div>

          <Countdown timer={timer} size="lg" />
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {!running && (
              <Button
                variant="primary"
                onClick={() => act("start")}
                disabled={busy !== null}
                title={session.status === "ended" ? "Restarts the clock for everyone" : undefined}
              >
                {paused ? "Restart from the beginning" : session.status === "ended" ? "Start again" : "Start Activity"}
              </Button>
            )}
            {running && (
              <Button onClick={() => act("pause")} disabled={busy !== null}>
                Pause
              </Button>
            )}
            {paused && (
              <Button variant="primary" onClick={() => act("resume")} disabled={busy !== null}>
                Resume
              </Button>
            )}
            <Button onClick={() => act("add_time", { seconds: 60 })} disabled={busy !== null || !started}>
              +1 minute
            </Button>
            <Button onClick={() => act("add_time", { seconds: 300 })} disabled={busy !== null || !started}>
              +5 minutes
            </Button>
            <Button
              variant="danger"
              onClick={() => setConfirmEnd(true)}
              disabled={busy !== null || session.status === "ended"}
            >
              End activity now
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <Button
              variant={session.revealResults ? "secondary" : "primary"}
              onClick={() => act(session.revealResults ? "hide" : "reveal")}
              disabled={busy !== null}
            >
              {session.revealResults ? "Hide results" : "Reveal Results"}
            </Button>

            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded border border-line-strong px-3 text-sm">
              <input
                type="checkbox"
                checked={session.allowLate}
                onChange={(e) => act("set_allow_late", { allowLate: e.target.checked })}
                className="h-4 w-4 accent-[#1D4ED8]"
              />
              Allow late submission
            </label>

            {session.revealResults && <Badge tone="goal">Results released to analytics</Badge>}
            {session.allowLate && <Badge tone="warn">Late submissions accepted</Badge>}
          </div>

          {!session.revealResults && (
            <p className="text-xs text-ink-muted">
              Students never see whether an answer is correct. Correct answers appear in Analytics and
              Teach Mode only after you press Reveal Results.
            </p>
          )}

          {error && <Notice tone="warn">{error}</Notice>}
        </div>
      </div>

      {confirmEnd && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="end-title"
          className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-4"
        >
          <div className="w-full max-w-md rounded border border-line bg-paper p-5">
            <h2 id="end-title" className="text-base font-semibold tracking-tight">
              End the activity now?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              The clock stops for everyone and submissions close
              {session.allowLate ? ", except that late submissions stay open." : "."}
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button onClick={() => setConfirmEnd(false)}>Cancel</Button>
              <Button
                variant="danger"
                onClick={async () => {
                  setConfirmEnd(false);
                  await act("end");
                }}
              >
                End activity
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
