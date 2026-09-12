"use client";

import React from "react";
import { layoutProblem, trimSegment } from "@/lib/search/layout";
import { childrenOf } from "@/lib/search/problem";
import type { NodeId, StateSpaceProblem } from "@/lib/search/types";
import { cx } from "./ui";

export interface GraphHighlight {
  /** The node currently being processed. */
  current?: NodeId | null;
  /** Nodes waiting in the frontier. */
  frontier?: NodeId[];
  /** Nodes already removed from the frontier, in processing order. */
  processed?: NodeId[];
  /** Children generated on this step. */
  generated?: NodeId[];
  /** Edges of the final solution path. Only drawn when the instructor asks. */
  solutionPath?: NodeId[] | null;
}

const STATE_STYLES = {
  idle: { fill: "#FFFFFF", stroke: "#C9C9CF", text: "#18181B", width: 1.5, dash: undefined },
  processed: { fill: "#F4F4F5", stroke: "#C9C9CF", text: "#52525B", width: 1.5, dash: undefined },
  frontier: { fill: "#EFF4FF", stroke: "#1D4ED8", text: "#1D4ED8", width: 1.75, dash: "4 3" },
  generated: { fill: "#FEF6E7", stroke: "#92400E", text: "#92400E", width: 1.75, dash: undefined },
  current: { fill: "#1D4ED8", stroke: "#1D4ED8", text: "#FFFFFF", width: 2.5, dash: undefined },
} as const;

type NodeState = keyof typeof STATE_STYLES;

/**
 * The state-space diagram.
 *
 * It deliberately does NOT reveal the answer: no node is marked as "on the
 * solution path" unless the instructor explicitly passes `solutionPath`, which
 * the student page never does.
 */
export function GraphView({
  problem,
  highlight,
  showOrdinals = false,
  caption = true,
  className,
  maxWidth,
  title,
}: {
  problem: StateSpaceProblem;
  highlight?: GraphHighlight;
  /** Number each processed node with its position in the search order. */
  showOrdinals?: boolean;
  caption?: boolean;
  className?: string;
  maxWidth?: number;
  title?: string;
}) {
  const layout = React.useMemo(() => layoutProblem(problem), [problem]);

  const processed = highlight?.processed ?? [];
  const frontier = new Set(highlight?.frontier ?? []);
  const generated = new Set(highlight?.generated ?? []);
  const current = highlight?.current ?? null;
  const pathNodes = highlight?.solutionPath ?? null;

  const pathEdges = new Set<string>();
  if (pathNodes) {
    for (let i = 0; i < pathNodes.length - 1; i++) pathEdges.add(`${pathNodes[i]}>${pathNodes[i + 1]}`);
  }

  const stateOf = (id: NodeId): NodeState => {
    if (current === id) return "current";
    if (generated.has(id)) return "generated";
    if (frontier.has(id)) return "frontier";
    if (processed.includes(id)) return "processed";
    return "idle";
  };

  const r = layout.nodeRadius;

  return (
    <figure className={cx("m-0", className)}>
      <div className="w-full overflow-x-auto" style={maxWidth ? { maxWidth } : undefined}>
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full"
          style={{ minWidth: 320 }}
          role="img"
          aria-label={
            title ??
            `State space for ${problem.name}. Start node ${problem.start}, goal node ${problem.goal}. ${describeChildren(problem)}`
          }
        >
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#A1A1AA" />
            </marker>
            <marker id="arrow-path" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#047857" />
            </marker>
          </defs>

          {/* Edges first so nodes always sit on top of them. */}
          {layout.edges.map((edge) => {
            const onPath = pathEdges.has(`${edge.from}>${edge.to}`);
            // Stop the arrow short of a node that carries a name above it,
            // so the head never lands on top of the text.
            const targetLabelled = !!layout.byId[edge.to]?.label && hasChildren(problem, edge.to);
            const seg = trimSegment(edge.x1, edge.y1, edge.x2, edge.y2, r + 2, r + (targetLabelled ? 22 : 8));
            return (
              <g key={`${edge.from}-${edge.to}`}>
                <line
                  x1={seg.x1}
                  y1={seg.y1}
                  x2={seg.x2}
                  y2={seg.y2}
                  stroke={onPath ? "#047857" : "#A1A1AA"}
                  strokeWidth={onPath ? 3 : 1.5}
                  strokeDasharray={edge.isCrossLink ? "5 4" : undefined}
                  markerEnd={`url(#${onPath ? "arrow-path" : "arrow"})`}
                />
                {/* Cost sits in a small plate so it never collides with the line. */}
                <rect
                  x={edge.labelX - 11}
                  y={edge.labelY - 10}
                  width={22}
                  height={20}
                  rx={3}
                  fill="#FFFFFF"
                  stroke={onPath ? "#A7E3CB" : "#E4E4E7"}
                />
                <text
                  x={edge.labelX}
                  y={edge.labelY}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={12}
                  fontWeight={600}
                  fill={onPath ? "#047857" : "#52525B"}
                >
                  {edge.cost}
                </text>
              </g>
            );
          })}

          {layout.nodes.map((node) => {
            const state = stateOf(node.id);
            const style = STATE_STYLES[state];
            const ordinal = showOrdinals ? processed.lastIndexOf(node.id) : -1;

            return (
              <g key={node.id}>
                {/* Goal gets a second ring, so it reads as the goal even in greyscale. */}
                {node.isGoal && (
                  <circle cx={node.x} cy={node.y} r={r + 4} fill="none" stroke="#047857" strokeWidth={1.5} />
                )}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={r}
                  fill={style.fill}
                  stroke={node.isGoal && state === "idle" ? "#047857" : style.stroke}
                  strokeWidth={style.width}
                  strokeDasharray={style.dash}
                />
                <text
                  x={node.x}
                  y={node.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={16}
                  fontWeight={700}
                  fill={style.text}
                >
                  {node.id}
                </text>

                {/* Friendly names sit ABOVE a node that has children, because
                    the space below it belongs to its outgoing edges. Leaves
                    keep their name underneath, where there is nothing to hit. */}
                {node.isStart && (
                  <text
                    x={node.x}
                    y={node.y - r - (node.label && hasChildren(problem, node.id) ? 25 : 12)}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#1D4ED8"
                  >
                    START
                  </text>
                )}
                {node.isGoal && (
                  <text
                    x={node.x}
                    y={node.y - r - (node.label && hasChildren(problem, node.id) ? 25 : 12)}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#047857"
                  >
                    GOAL
                  </text>
                )}

                {node.label &&
                  (hasChildren(problem, node.id) ? (
                    <text x={node.x} y={node.y - r - 11} textAnchor="middle" fontSize={10} fill="#8A8A93">
                      {node.label}
                    </text>
                  ) : (
                    <text x={node.x} y={node.y + r + 15} textAnchor="middle" fontSize={10} fill="#8A8A93">
                      {node.label}
                    </text>
                  ))}

                {ordinal >= 0 && (
                  <g>
                    <circle cx={node.x + r - 2} cy={node.y - r + 2} r={9} fill="#18181B" />
                    <text
                      x={node.x + r - 2}
                      y={node.y - r + 2}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={10}
                      fontWeight={700}
                      fill="#FFFFFF"
                    >
                      {ordinal + 1}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {caption && (
        <figcaption className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">Children are expanded left to right.</span>{" "}
          {describeChildren(problem)}
        </figcaption>
      )}
    </figure>
  );
}

function hasChildren(problem: StateSpaceProblem, id: NodeId): boolean {
  return childrenOf(problem, id).length > 0;
}

/** Spells out the child ordering, so nobody has to infer it from the picture. */
export function describeChildren(problem: StateSpaceProblem): string {
  return problem.nodes
    .map((n) => {
      const kids = childrenOf(problem, n.id);
      if (!kids.length) return null;
      return `${n.id} → ${kids.map((k) => k.to).join(", ")}`;
    })
    .filter(Boolean)
    .join("  ·  ");
}

/** Legend for Teach Mode. Every state is named in words as well as coloured. */
export function GraphLegend({ className }: { className?: string }) {
  const items: { state: NodeState; label: string }[] = [
    { state: "current", label: "Being processed" },
    { state: "frontier", label: "In frontier" },
    { state: "generated", label: "Just generated" },
    { state: "processed", label: "Already processed" },
    { state: "idle", label: "Not reached yet" },
  ];
  return (
    <ul className={cx("flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-muted", className)}>
      {items.map(({ state, label }) => {
        const s = STATE_STYLES[state];
        return (
          <li key={state} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-full"
              style={{
                background: s.fill,
                border: `${s.width}px ${s.dash ? "dashed" : "solid"} ${s.stroke}`,
              }}
            />
            {label}
          </li>
        );
      })}
    </ul>
  );
}
