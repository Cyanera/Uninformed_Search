import type { StateSpaceProblem, Strategy, StrategyAnswer } from "@/lib/search/types";

export type SessionStatus = "lobby" | "running" | "paused" | "ended";
export type SubmissionStatus = "in_progress" | "submitted";

export interface SessionRow {
  id: string;
  code: string;
  owner_id: string;
  title: string;
  problem_id: string | null;
  problem_snapshot: StateSpaceProblem;
  strategies: Strategy[];
  duration_seconds: number;
  status: SessionStatus;
  started_at: string | null;
  paused_at: string | null;
  accumulated_pause_seconds: number;
  ended_at: string | null;
  allow_late: boolean;
  reveal_results: boolean;
  created_at: string;
}

export interface ParticipantRow {
  id: string;
  session_id: string;
  name: string;
  student_number: string;
  joined_at: string;
  last_seen_at: string;
  final_submitted_at: string | null;
  is_late: boolean;
}

export interface SubmissionRow {
  id: string;
  session_id: string;
  participant_id: string;
  strategy: Strategy;
  answer_json: StrategyAnswer;
  status: SubmissionStatus;
  submitted_at: string | null;
  updated_at: string;
  is_late: boolean;
  score_data_json: unknown | null;
}

export interface ProblemRow {
  id: string;
  owner_id: string | null;
  name: string;
  story: string | null;
  start_node: string;
  goal_node: string;
  nodes: { id: string; label?: string }[];
  edges: { from: string; to: string; cost: number }[];
  depth_limit: number;
  is_template: boolean;
  created_at: string;
}

/** Identity a student's browser keeps in localStorage. */
export interface StudentIdentity {
  participantId: string;
  clientToken: string;
  sessionId: string;
  sessionCode: string;
  name: string;
  studentNumber: string;
}

/** Payload returned by /api/session/state and /api/session/join. */
export interface SessionStatePayload {
  session: PublicSession;
  serverNow: number;
}

/** The subset of a session a student's browser is allowed to know about. */
export interface PublicSession {
  id: string;
  code: string;
  title: string;
  problem: StateSpaceProblem;
  strategies: Strategy[];
  durationSeconds: number;
  status: SessionStatus;
  startedAt: string | null;
  pausedAt: string | null;
  accumulatedPauseSeconds: number;
  allowLate: boolean;
  revealResults: boolean;
}

export function toPublicSession(row: SessionRow): PublicSession {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    problem: row.problem_snapshot,
    strategies: row.strategies,
    durationSeconds: row.duration_seconds,
    status: row.status,
    startedAt: row.started_at,
    pausedAt: row.paused_at,
    accumulatedPauseSeconds: row.accumulated_pause_seconds,
    allowLate: row.allow_late,
    revealResults: row.reveal_results,
  };
}

export function problemRowToProblem(row: ProblemRow): StateSpaceProblem {
  return {
    name: row.name,
    story: row.story ?? undefined,
    start: row.start_node,
    goal: row.goal_node,
    nodes: row.nodes,
    edges: row.edges,
    depthLimit: row.depth_limit,
  };
}
