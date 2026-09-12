-- ===========================================================================
-- Uninformed Search classroom activity — schema
--
-- Trust model
-- -----------
--   * Instructors authenticate with Supabase Auth and own their sessions.
--   * Students have NO account. They join with a short session code and are
--     identified by a random `client_token` issued at join time and kept in
--     the browser's localStorage.
--   * Every student write goes through a Next.js route handler that uses the
--     service-role key AFTER validating that token. The anon key therefore
--     needs no INSERT/UPDATE policy at all.
--   * The anon key may read `sessions` only. That is what lets a student's
--     browser subscribe to the timer in realtime. Participants and their
--     answers are readable by the owning instructor and nobody else, so one
--     student can never read another student's answers.
--   * Canonical answers are never stored. They are computed from the problem
--     definition by the search engine, on the instructor's side only.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- State-space problems
-- ---------------------------------------------------------------------------
create table if not exists public.state_space_problems (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid references auth.users (id) on delete cascade,
  name         text        not null,
  story        text,
  start_node   text        not null,
  goal_node    text        not null,
  -- [{ "id": "S", "label": "Main Gate" }, ...]
  nodes        jsonb       not null,
  -- [{ "from": "S", "to": "A", "cost": 4 }, ...]  ARRAY ORDER IS THE
  -- LEFT-TO-RIGHT CHILD ORDER. Do not sort this column.
  edges        jsonb       not null,
  depth_limit  integer     not null default 2,
  -- Built-in templates are visible to every signed-in instructor.
  is_template  boolean     not null default false,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Classroom sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text        not null unique,
  owner_id    uuid        not null references auth.users (id) on delete cascade,
  title       text        not null default 'Uninformed Search Activity',
  problem_id  uuid        references public.state_space_problems (id) on delete set null,
  -- Frozen copy of the problem, so editing the template later can never
  -- invalidate answers that have already been submitted against it.
  problem_snapshot jsonb  not null,

  strategies  text[]      not null default array['BFS','DFS','IDS','UCS'],

  -- Timer ---------------------------------------------------------------
  duration_seconds          integer not null default 900,  -- 15 minutes
  status                    text    not null default 'lobby'
                            check (status in ('lobby','running','paused','ended')),
  started_at                timestamptz,
  paused_at                 timestamptz,
  accumulated_pause_seconds integer not null default 0,
  ended_at                  timestamptz,

  -- Instructor switches --------------------------------------------------
  allow_late      boolean not null default false,
  reveal_results  boolean not null default false,

  created_at  timestamptz not null default now()
);

create index if not exists sessions_owner_idx on public.sessions (owner_id, created_at desc);
create index if not exists sessions_code_idx  on public.sessions (code);

-- ---------------------------------------------------------------------------
-- Students in a session (no account, no password)
-- ---------------------------------------------------------------------------
create table if not exists public.student_participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  name           text not null,
  student_number text not null,
  -- Bearer token proving "I am this participant". Never exposed to the
  -- instructor UI and never readable with the anon key.
  client_token   uuid not null default gen_random_uuid(),
  joined_at      timestamptz not null default now(),
  last_seen_at   timestamptz not null default now(),
  final_submitted_at timestamptz,
  is_late        boolean not null default false,
  unique (session_id, student_number)
);

create index if not exists participants_session_idx on public.student_participants (session_id);

-- ---------------------------------------------------------------------------
-- One row per (student, strategy). Holds the LATEST answer.
-- ---------------------------------------------------------------------------
create table if not exists public.strategy_submissions (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.student_participants (id) on delete cascade,
  strategy       text not null check (strategy in ('BFS','DFS','IDS','UCS','DLS')),
  -- BFS/DFS/UCS/DLS : { "sequence": ["S","A", ...] }
  -- IDS             : { "iterations": [{ "limit": 0, "sequence": ["S"] }, ...] }
  answer_json    jsonb not null default '{}'::jsonb,
  status         text  not null default 'in_progress'
                 check (status in ('in_progress','submitted')),
  submitted_at   timestamptz,
  updated_at     timestamptz not null default now(),
  is_late        boolean not null default false,
  -- Populated when the instructor reveals results, as a durable record.
  score_data_json jsonb,
  unique (participant_id, strategy)
);

create index if not exists submissions_session_idx     on public.strategy_submissions (session_id);
create index if not exists submissions_participant_idx on public.strategy_submissions (participant_id);

-- ---------------------------------------------------------------------------
-- Append-only history: every submit press, so the instructor can see how a
-- student's thinking changed during the activity.
-- ---------------------------------------------------------------------------
create table if not exists public.submission_attempts (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  participant_id uuid not null references public.student_participants (id) on delete cascade,
  strategy       text not null,
  answer_json    jsonb not null,
  is_late        boolean not null default false,
  created_at     timestamptz not null default now()
);

create index if not exists attempts_participant_idx on public.submission_attempts (participant_id, created_at);

-- ===========================================================================
-- Row level security
-- ===========================================================================
alter table public.state_space_problems  enable row level security;
alter table public.sessions              enable row level security;
alter table public.student_participants  enable row level security;
alter table public.strategy_submissions  enable row level security;
alter table public.submission_attempts   enable row level security;

-- Problems: owners manage their own; templates are readable by any instructor.
drop policy if exists problems_owner_all on public.state_space_problems;
create policy problems_owner_all on public.state_space_problems
  for all to authenticated
  using (owner_id = auth.uid() or is_template)
  with check (owner_id = auth.uid());

-- Sessions: world-readable so a student's browser can watch the timer.
-- Nothing secret lives on this row — the graph is printed on the screen anyway,
-- and canonical answers are never stored.
drop policy if exists sessions_public_read on public.sessions;
create policy sessions_public_read on public.sessions
  for select to anon, authenticated
  using (true);

drop policy if exists sessions_owner_write on public.sessions;
create policy sessions_owner_write on public.sessions
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Participants and answers: readable ONLY by the instructor who owns the
-- session. Students never read these tables directly; their own data comes
-- back from the API route that authenticated their client_token.
drop policy if exists participants_owner_read on public.student_participants;
create policy participants_owner_read on public.student_participants
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = student_participants.session_id and s.owner_id = auth.uid()
  ));

drop policy if exists submissions_owner_read on public.strategy_submissions;
create policy submissions_owner_read on public.strategy_submissions
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = strategy_submissions.session_id and s.owner_id = auth.uid()
  ));

drop policy if exists attempts_owner_read on public.submission_attempts;
create policy attempts_owner_read on public.submission_attempts
  for select to authenticated
  using (exists (
    select 1 from public.sessions s
    where s.id = submission_attempts.session_id and s.owner_id = auth.uid()
  ));

-- ===========================================================================
-- Realtime
-- ===========================================================================
-- Students subscribe to `sessions` (timer + reveal flag).
-- Instructors subscribe to participants and submissions; RLS above means the
-- stream only ever carries rows from their own sessions.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Idempotent: adding a table that is already published raises an error, and
-- this migration must be safe to re-run.
do $$
declare
  t text;
begin
  foreach t in array array['sessions', 'student_participants', 'strategy_submissions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Realtime UPDATE events only carry the changed columns unless the table is
-- set to emit the full row. The dashboard needs whole rows.
alter table public.sessions             replica identity full;
alter table public.student_participants replica identity full;
alter table public.strategy_submissions replica identity full;
