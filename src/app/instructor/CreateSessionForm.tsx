"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Field, Input, Notice, Select, cx } from "@/components/ui";
import { DEFAULT_DURATION_SECONDS, DURATION_PRESETS } from "@/lib/timer";
import { DEFAULT_STRATEGIES, ALL_STRATEGIES, STRATEGY_NAMES, type Strategy } from "@/lib/search/types";
import type { ProblemRow } from "@/lib/types";

export function CreateSessionForm({ problems }: { problems: ProblemRow[] }) {
  const router = useRouter();
  const [title, setTitle] = useState("Uninformed Search Activity");
  const [problemId, setProblemId] = useState(problems[0]?.id ?? "");
  const [minutes, setMinutes] = useState(DEFAULT_DURATION_SECONDS / 60);
  const [custom, setCustom] = useState(false);
  const [strategies, setStrategies] = useState<Strategy[]>(DEFAULT_STRATEGIES);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggle = (s: Strategy) =>
    setStrategies((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch("/api/instructor/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          problemId: problemId || undefined,
          durationSeconds: Math.round(minutes * 60),
          strategies,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not create the session.");
      router.push(`/instructor/session/${data.session.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-5 rounded border border-line bg-paper p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Activity name" htmlFor="title">
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </Field>

        <Field label="State space" htmlFor="problem" hint="Frozen into the session when it is created.">
          <Select id="problem" value={problemId} onChange={(e) => setProblemId(e.target.value)}>
            {problems.length === 0 && <option value="">Campus Delivery Robot (built in)</option>}
            {problems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.is_template ? " (template)" : ""}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Field
        label="Activity duration"
        hint="15 minutes by default: students solve the same problem four ways, including IDS and UCS."
      >
        <div className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              size="sm"
              variant={!custom && minutes === preset ? "primary" : "secondary"}
              onClick={() => {
                setCustom(false);
                setMinutes(preset);
              }}
            >
              {preset} min
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant={custom ? "primary" : "secondary"}
            onClick={() => setCustom(true)}
          >
            Custom
          </Button>
          {custom && (
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Custom duration in minutes</span>
              <Input
                type="number"
                min={1}
                max={240}
                value={minutes}
                onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="w-24"
              />
              minutes
            </label>
          )}
        </div>
      </Field>

      <Field label="Strategies" hint="Depth-Limited Search is off by default and can be enabled at any time.">
        <div className="flex flex-wrap gap-2">
          {ALL_STRATEGIES.map((s) => {
            const on = strategies.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggle(s)}
                aria-pressed={on}
                title={STRATEGY_NAMES[s]}
                className={cx(
                  "min-h-[44px] rounded border px-3 text-sm font-medium transition-colors",
                  on
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line-strong bg-paper text-ink-muted hover:bg-canvas",
                )}
              >
                {on ? "✓ " : ""}
                {s}
              </button>
            );
          })}
        </div>
      </Field>

      {error && <Notice tone="warn">{error}</Notice>}

      <Button type="submit" variant="primary" disabled={busy || !strategies.length}>
        {busy ? "Creating…" : "Create session"}
      </Button>
    </form>
  );
}
