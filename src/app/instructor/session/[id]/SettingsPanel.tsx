"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, Input, Notice, cx } from "@/components/ui";
import { GraphView } from "@/components/GraphView";
import { DURATION_PRESETS } from "@/lib/timer";
import { validateProblem } from "@/lib/search/problem";
import { ALL_STRATEGIES, STRATEGY_NAMES, type StateSpaceProblem, type Strategy } from "@/lib/search/types";
import type { PublicSession } from "@/lib/types";

/**
 * A structured activity editor, not a visual graph designer.
 *
 * Editing is blocked while the activity is running, because the answer key is
 * derived from the problem: changing an edge cost mid-run would silently
 * re-mark work that students had already submitted.
 */
export function SettingsPanel({ session }: { session: PublicSession }) {
  const router = useRouter();
  const locked = session.status === "running" || session.status === "paused";

  const [title, setTitle] = useState(session.title);
  const [minutes, setMinutes] = useState(session.durationSeconds / 60);
  const [strategies, setStrategies] = useState<Strategy[]>(session.strategies);
  const [problem, setProblem] = useState<StateSpaceProblem>(session.problem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const validation = validateProblem(problem);

  const update = (patch: Partial<StateSpaceProblem>) => {
    setProblem((p) => ({ ...p, ...patch }));
    setSaved(false);
  };

  const setEdge = (index: number, patch: Partial<StateSpaceProblem["edges"][number]>) =>
    update({ edges: problem.edges.map((e, i) => (i === index ? { ...e, ...patch } : e)) });

  const moveEdge = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= problem.edges.length) return;
    const edges = [...problem.edges];
    [edges[index], edges[target]] = [edges[target], edges[index]];
    update({ edges });
  };

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/instructor/sessions/${session.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_settings",
          title,
          durationSeconds: Math.round(minutes * 60),
          strategies,
          problem,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save.");
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {locked && (
        <Notice tone="warn" title="The activity is running">
          Pause and end the activity before changing its configuration. Editing the state space while
          students are answering would change the answer key underneath them.
        </Notice>
      )}

      <Card title="Activity">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Activity name" htmlFor="s-title">
            <Input
              id="s-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setSaved(false);
              }}
              disabled={locked}
              maxLength={120}
            />
          </Field>

          <Field label="Duration" htmlFor="s-minutes">
            <div className="flex flex-wrap items-center gap-2">
              {DURATION_PRESETS.map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant={minutes === p ? "primary" : "secondary"}
                  onClick={() => {
                    setMinutes(p);
                    setSaved(false);
                  }}
                  disabled={locked}
                >
                  {p}
                </Button>
              ))}
              <Input
                id="s-minutes"
                type="number"
                min={1}
                max={240}
                value={minutes}
                onChange={(e) => {
                  setMinutes(Math.max(1, Number(e.target.value) || 1));
                  setSaved(false);
                }}
                disabled={locked}
                className="w-24"
              />
              <span className="text-sm text-ink-muted">minutes</span>
            </div>
          </Field>
        </div>

        <Field label="Strategies" hint="Depth-Limited Search can be enabled here.">
          <div className="mt-1 flex flex-wrap gap-2">
            {ALL_STRATEGIES.map((s) => {
              const on = strategies.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={locked}
                  title={STRATEGY_NAMES[s]}
                  aria-pressed={on}
                  onClick={() => {
                    setStrategies((prev) => (on ? prev.filter((x) => x !== s) : [...prev, s]));
                    setSaved(false);
                  }}
                  className={cx(
                    "min-h-[44px] rounded border px-3 text-sm font-medium transition-colors disabled:opacity-60",
                    on ? "border-accent bg-accent-soft text-accent" : "border-line-strong bg-paper text-ink-muted",
                  )}
                >
                  {on ? "✓ " : ""}
                  {s}
                </button>
              );
            })}
          </div>
        </Field>
      </Card>

      <Card
        title="State space"
        description="Edge order is the left-to-right child order. Reordering edges changes every answer."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start node" htmlFor="s-start">
            <select
              id="s-start"
              value={problem.start}
              onChange={(e) => update({ start: e.target.value })}
              disabled={locked}
              className="min-h-[44px] w-full rounded border border-line-strong bg-paper px-3"
            >
              {problem.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} {n.label ? `— ${n.label}` : ""}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Goal node" htmlFor="s-goal">
            <select
              id="s-goal"
              value={problem.goal}
              onChange={(e) => update({ goal: e.target.value })}
              disabled={locked}
              className="min-h-[44px] w-full rounded border border-line-strong bg-paper px-3"
            >
              {problem.nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id} {n.label ? `— ${n.label}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
            Edges, in child order
          </p>
          <ul className="divide-y divide-line rounded border border-line">
            {problem.edges.map((edge, i) => {
              const siblings = problem.edges.filter((e) => e.from === edge.from);
              const position = siblings.indexOf(edge) + 1;
              return (
                <li key={`${edge.from}-${edge.to}-${i}`} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <span className="font-mono text-sm font-semibold">
                    {edge.from} → {edge.to}
                  </span>
                  <span className="rounded bg-canvas px-1.5 py-0.5 text-xs text-ink-muted">
                    child {position} of {siblings.length}
                  </span>
                  <label className="flex items-center gap-1.5 text-sm">
                    <span className="text-ink-muted">cost</span>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={edge.cost}
                      disabled={locked}
                      onChange={(e) => setEdge(i, { cost: Number(e.target.value) })}
                      className="w-20"
                    />
                  </label>
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" onClick={() => moveEdge(i, -1)} disabled={locked || i === 0} aria-label={`Move ${edge.from} to ${edge.to} earlier`}>
                      ↑
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => moveEdge(i, 1)}
                      disabled={locked || i === problem.edges.length - 1}
                      aria-label={`Move ${edge.from} to ${edge.to} later`}
                    >
                      ↓
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {validation.errors.length > 0 && (
          <Notice tone="warn" title="Fix these before saving">
            <ul className="mt-1 list-inside list-disc">
              {validation.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Notice>
        )}
        {validation.warnings.length > 0 && (
          <Notice tone="neutral" title="Worth checking">
            <ul className="mt-1 list-inside list-disc">
              {validation.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Notice>
        )}

        <div className="mt-5 rounded border border-line p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">Preview</p>
          <GraphView problem={problem} />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={locked || busy || !validation.ok}>
          {busy ? "Saving…" : "Save configuration"}
        </Button>
        {saved && <span className="text-sm font-medium text-goal">Saved.</span>}
        {error && <Notice tone="warn">{error}</Notice>}
      </div>
    </div>
  );
}
