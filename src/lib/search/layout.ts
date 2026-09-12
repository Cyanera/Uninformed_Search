import { childrenOf } from "./problem";
import type { NodeId, StateSpaceProblem } from "./types";

/**
 * A tidy layered layout for the state-space diagram.
 *
 * The left-to-right child ordering is the whole point of the picture, so leaves
 * are laid out in generation order and every parent is centred over its own
 * children. Works for any instructor-edited graph, not just the default one.
 */

export interface LayoutNode {
  id: NodeId;
  label?: string;
  x: number;
  y: number;
  depth: number;
  /** Index among its siblings, left to right. Used for the "1st child" hints. */
  childIndex: number;
  isStart: boolean;
  isGoal: boolean;
}

export interface LayoutEdge {
  from: NodeId;
  to: NodeId;
  cost: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Label anchor, nudged off the line so it never sits on top of it. */
  labelX: number;
  labelY: number;
  childIndex: number;
  /** True when the edge is not part of the spanning tree used for the layout. */
  isCrossLink: boolean;
}

export interface GraphLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  nodeRadius: number;
  byId: Record<NodeId, LayoutNode>;
}

const MARGIN_X = 44;
const MARGIN_Y = 46;
const COL_WIDTH = 112;
const ROW_HEIGHT = 116;
const NODE_RADIUS = 22;

export function layoutProblem(problem: StateSpaceProblem): GraphLayout {
  const parent = new Map<NodeId, NodeId>();
  const depth = new Map<NodeId, number>();
  const childIndex = new Map<NodeId, number>();
  const order: NodeId[] = [];

  // Depth-first from the start, following the declared child order. The first
  // time a node is reached fixes its place in the layout tree.
  const visited = new Set<NodeId>();
  const walk = (id: NodeId, d: number) => {
    if (visited.has(id)) return;
    visited.add(id);
    depth.set(id, d);
    order.push(id);
    childrenOf(problem, id).forEach((edge, i) => {
      if (!visited.has(edge.to)) {
        parent.set(edge.to, id);
        childIndex.set(edge.to, i);
      }
      walk(edge.to, d + 1);
    });
  };
  walk(problem.start, 0);

  // Anything unreachable from the start still has to be drawn.
  let orphanRow = Math.max(0, ...[...depth.values()]) + 1;
  for (const n of problem.nodes) {
    if (!visited.has(n.id)) {
      visited.add(n.id);
      depth.set(n.id, orphanRow);
      order.push(n.id);
    }
  }

  const treeChildren = new Map<NodeId, NodeId[]>();
  for (const id of order) treeChildren.set(id, []);
  for (const [child, p] of parent) treeChildren.get(p)?.push(child);
  // Keep siblings in declared order.
  for (const [p, kids] of treeChildren) {
    const declared = childrenOf(problem, p).map((e) => e.to);
    kids.sort((a, b) => declared.indexOf(a) - declared.indexOf(b));
  }

  // Assign column slots: leaves get consecutive slots, parents are centred.
  const slot = new Map<NodeId, number>();
  let nextSlot = 0;
  const assign = (id: NodeId): number => {
    const kids = treeChildren.get(id) ?? [];
    if (!kids.length) {
      const s = nextSlot++;
      slot.set(id, s);
      return s;
    }
    const positions = kids.map(assign);
    const s = (Math.min(...positions) + Math.max(...positions)) / 2;
    slot.set(id, s);
    return s;
  };
  assign(problem.start);
  for (const n of problem.nodes) if (!slot.has(n.id)) slot.set(n.id, nextSlot++);

  const nodes: LayoutNode[] = problem.nodes.map((n) => ({
    id: n.id,
    label: n.label,
    x: MARGIN_X + (slot.get(n.id) ?? 0) * COL_WIDTH,
    y: MARGIN_Y + (depth.get(n.id) ?? 0) * ROW_HEIGHT,
    depth: depth.get(n.id) ?? 0,
    childIndex: childIndex.get(n.id) ?? 0,
    isStart: n.id === problem.start,
    isGoal: n.id === problem.goal,
  }));

  const byId: Record<NodeId, LayoutNode> = {};
  for (const n of nodes) byId[n.id] = n;

  const edges: LayoutEdge[] = problem.edges.map((e, i) => {
    const a = byId[e.from];
    const b = byId[e.to];
    const x1 = a?.x ?? 0;
    const y1 = a?.y ?? 0;
    const x2 = b?.x ?? 0;
    const y2 = b?.y ?? 0;
    // Nudge the cost label perpendicular to the edge so it clears the line.
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const offset = 13;
    return {
      from: e.from,
      to: e.to,
      cost: e.cost,
      x1,
      y1,
      x2,
      y2,
      labelX: (x1 + x2) / 2 + (-dy / len) * offset,
      labelY: (y1 + y2) / 2 + (dx / len) * offset,
      childIndex: problem.edges.filter((o) => o.from === e.from).indexOf(e),
      isCrossLink: parent.get(e.to) !== e.from,
    };
  });

  const maxX = Math.max(...nodes.map((n) => n.x), MARGIN_X);
  const maxY = Math.max(...nodes.map((n) => n.y), MARGIN_Y);

  return {
    nodes,
    edges,
    width: maxX + MARGIN_X,
    height: maxY + MARGIN_Y,
    nodeRadius: NODE_RADIUS,
    byId,
  };
}

/** Shorten a segment at both ends so the arrow head stops at the node border. */
export function trimSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  startPad: number,
  endPad: number,
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  return {
    x1: x1 + ux * startPad,
    y1: y1 + uy * startPad,
    x2: x2 - ux * endPad,
    y2: y2 - uy * endPad,
  };
}
