# Uninformed Search — Classroom Activity

A live classroom activity for **Principles of Artificial Intelligence**. Students solve one
state space four ways — **BFS, DFS, IDS and UCS** — and record the **order in which nodes are
processed**, not just the path to the goal. The instructor watches progress in real time, then
works the same problem step by step on the projector.

The whole design follows from one idea: *the final path tells you almost nothing about whether a
student understands the search.* `S → C → G` is the answer to a different question. What matters is
which node leaves the frontier next, and why.

---

## Run it

There is no shared hosted instance, and there cannot be a useful one: every class needs its own
database, its own session codes and its own student records. Getting your own copy running takes
about ten minutes, and the free tiers of both services are enough for a lecture theatre.

**Step 1 — create a Supabase project.** This is the only step that needs you, because it needs your
account. Create a free project at [supabase.com](https://supabase.com), and save the database
password it asks you to choose — you need it again in a moment.

Then collect four values. The dashboard reorganises its settings pages from time to time, so the
quickest route is the **Connect** button in the top bar: **App Frameworks → Next.js** lists the
first two already named exactly as this project expects, and **ORMs / Connection string** gives the
fourth.

| Value | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co`, where `<ref>` is the id in your browser's address bar: `supabase.com/dashboard/project/<ref>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the public key — *Publishable key* (`sb_publishable_…`), or *anon public* on older projects |
| `SUPABASE_SERVICE_ROLE_KEY` | the secret key — *Secret key* (`sb_secret_…`), or *service_role* behind a Reveal button |
| `SUPABASE_DB_URL` | Connection string → URI. Replace `[YOUR-PASSWORD]`, and use **port 5432** — port 6543 is the transaction pooler and cannot run migrations |

`npm run setup` checks all four and tells you exactly what to change if one is wrong.

**Step 2 — let the setup script do the rest.**

Run these in a terminal on your own machine — Terminal on macOS, or PowerShell on Windows.
You need [Node.js](https://nodejs.org) 20 or newer; check with `node -v`.

```bash
git clone https://github.com/Cyanera/Uninformed_Search.git
cd Uninformed_Search
npm install
npm run setup                  # asks for the four values, then does everything
npm run demo                   # optional: a finished demo class to look around in
npm run dev                    # http://localhost:3000
```

On a first run `npm run setup` asks for each value in turn, explains where to find it, checks it
against your project before accepting it, and writes `.env.local` itself — so there is no file to
edit by hand and nothing to put in the wrong place. Secrets are not echoed as you type, and the
file is written owner-only and is git-ignored. `npm run setup -- --reconfigure` runs the questions
again if a value needs changing.

`npm run setup` applies `0001_init.sql` and `seed.sql` for you, and creates your instructor account
already confirmed, so no confirmation email stands between you and your first lecture. It is safe to
re-run. If you would rather not hand it the database password, leave `SUPABASE_DB_URL` empty and it
will tell you exactly which two files to paste into the SQL Editor instead.

`npm run demo` creates a completed session with eight students who made the mistakes this activity
is built to catch — one answered BFS depth-first, one stopped the moment `G` was generated, one
never restarted IDS, one submitted the solution path — so you can see the dashboard, every analytics
panel and Teach Mode with real data before any student touches it.

**Step 3 — put it online.**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FCyanera%2FUninformed_Search&env=NEXT_PUBLIC_SUPABASE_URL%2CNEXT_PUBLIC_SUPABASE_ANON_KEY%2CSUPABASE_SERVICE_ROLE_KEY&envDescription=Supabase%20API%20keys%20%28Project%20Settings%20%3E%20API%29.%20SUPABASE_SERVICE_ROLE_KEY%20is%20a%20server-only%20secret.&envLink=https%3A%2F%2Fgithub.com%2FCyanera%2FUninformed_Search%2Fblob%2Fclaude%2Fecstatic-bardeen-igyyc0%2F.env.example&project-name=uninformed-search&repository-name=uninformed-search)

Vercel asks for the same three `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` values you already put in `.env.local`. Deploy without them and the app
builds but every page that touches the database fails.

One last thing in Supabase: set **Authentication → URL Configuration → Site URL** to your Vercel
domain, so instructor sign-in redirects land in the right place.

You are ready. Sign in at `/instructor`, create a session, project the code, and students join at
`/join`.

---

## What it does

**Students** join from a phone or laptop with a session code, a name and a student ID. No account,
no password. They tap node buttons — never type — to build the processing order for each strategy.

**During the activity they are told nothing about correctness.** A submission reports only
"Submitted" and a timestamp. Students may revise and resubmit until the timer ends. This is
deliberate: instant feedback lets a class brute-force the answer by repeated guessing, which
measures persistence rather than understanding.

**Instructors** get a live board, per-student inspection showing exactly where each student's
reasoning first diverged, class-wide analytics, and a step-by-step **Teach Mode** for the projector.

### The default problem — "Campus Delivery Robot"

A delivery robot starts at the Main Gate (`S`) and must reach the AI Lab (`G`).

```
S → A  cost 4        A → D  cost 1        C → H  cost 1
S → B  cost 1        A → E  cost 3        C → G  cost 3
S → C  cost 8        B → F  cost 2
```

Children, left to right: `S → [A, B, C]`, `A → [D, E]`, `B → [F]`, `C → [H, G]`.

The graph is shaped so that all four strategies disagree. The cheapest first move (`S → B`) leads
nowhere useful, and the goal hides behind the most expensive one (`S → C`):

| Strategy | Processing order |
| --- | --- |
| BFS | `S, A, B, C, D, E, F, H, G` |
| DFS | `S, A, D, E, B, F, C, H, G` |
| UCS | `S, B, F, A, D, E, C, H, G` |
| IDS | `L=0: S` · `L=1: S, A, B, C` · `L=2: S, A, D, E, B, F, C, H, G` |

Solution path: `S → C → G`, cost 11 — which no strategy's *search order* resembles.

---

## Search conventions

One convention, applied everywhere, so answers can be compared fairly. The rules are printed on
the student's screen while they answer, not hidden behind a help link.

- Children are generated **left to right** — the order of the `edges` array.
- Record the order in which nodes are **removed from the frontier and goal-tested**.
- **Include the goal node.** Never expand it.
- **Tree search**: repeated states are not pruned.

| | |
| --- | --- |
| **BFS** | FIFO queue; children join the back. Goal test on removal. |
| **DFS** | LIFO stack; children pushed in **reverse** so the leftmost child ends on top and the visible search runs left to right. Goal test on removal. |
| **IDS** | Depth-limited DFS at `L = 0, 1, 2, …`, **restarting from the start node every time**. A node *at* the limit is goal-tested but not expanded. Repeated nodes are the point and are preserved. |
| **UCS** | Priority queue on cumulative path cost `g(n)`. **Goal test only when the goal is removed from the queue** — generating it proves nothing, because a cheaper path may still be waiting. Ties: lower `g` first, then earlier insertion order. |

`DLS` is implemented and can be enabled per session, but is off in the default activity.

---

## Architecture

```
src/lib/search/      the engine — no React, no database, no I/O
  types.ts           problem, frontier, trace and answer shapes
  problem.ts         the default problem, child ordering, validation
  algorithms.ts      BFS / DFS / DLS / IDS / UCS, each emitting a full step trace
  scoring.ts         exact match, correct prefix, per-position accuracy, first divergence
  references.ts      simulations of specific student MISTAKES
  misconceptions.ts  rule-based detection built on those simulations
  layout.ts          tidy layered layout for the diagram

src/lib/analysis.ts  roster + submissions → per-student results and class statistics
src/app/api/         student join/submit and instructor control endpoints
src/app/s/[code]/    the student activity
src/app/instructor/  dashboard, analytics, Teach Mode, activity editor
supabase/            schema migration and seed
```

Three decisions worth knowing about:

**Canonical answers are computed, never stored.** Every expected answer comes from running the
engine on the session's own problem definition. Nothing is hard-coded outside the test suite, so
editing a graph produces a correct answer key for the edited graph automatically.

**The engine is never bundled into the student page.** No student route imports it, so Next.js
code-splitting keeps the answer key out of the student's JavaScript. The build check:

```bash
npm run build
grep -rl "smallest cumulative cost in the queue" .next/static/chunks/app/s   # must print nothing
```

**Every run emits a trace.** Teach Mode replays `frontierBefore`, the current node, generated
children with their `g(n)` arithmetic, `frontierAfter` and cutoffs — it never recomputes anything,
so what the class sees is by construction the same search the students were marked against.

### Timer

The session row stores absolute server timestamps (`started_at`, `accumulated_pause_seconds`),
not a countdown. Every device derives the remaining time from those, and each client measures its
own clock offset against the server. A student who joins ten minutes late, or whose phone clock is
wrong, sees exactly the same time remaining as everybody else. Paused time is not charged to
students.

### Security model

Students have no account. On joining they receive a random `client_token`, kept in `localStorage`,
which they present on every later write. All student writes go through server route handlers using
the service-role key **after** validating that token, so the public anon key needs no write access
to any table.

Row level security is what actually enforces this, and it is verified against a real Postgres:

| Role | Can read | Can write |
| --- | --- | --- |
| `anon` (student browser) | `sessions` rows only — that is what keeps the countdown in sync | nothing |
| `authenticated` (instructor) | `sessions` rows, plus the roster and answers **of sessions they own** | own sessions and problems |
| `service_role` (server only) | everything | everything |

One student can never read another student's answers, and one instructor can never read another
instructor's roster, submissions or attempts. The `client_token` is never exposed to any client
role or any UI.

The `sessions` row itself is deliberately world-readable: a student's browser must subscribe to it
to keep the countdown in sync, and it holds nothing private — the code, title, graph and timer
state are all on the classroom screen already, and canonical answers are never stored anywhere.
Because of that, the instructor's session list filters by owner in the query rather than relying on
the policy.

**Known trade-off:** a student who clears their browser storage can rejoin with the same student ID
and name and pick up their answers. That is deliberate — a phone that loses `localStorage`
mid-activity must not lock a student out — but it means a student who knows a classmate's ID *and*
name could open their answers. For an in-class formative activity that is the right balance. Do not
use this as an invigilated exam system without adding real student authentication.

---

## Setup

### 1. Requirements

Node.js 20+ and a free [Supabase](https://supabase.com) project.

### 2. Install

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` from **Supabase → Project Settings → API**:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon / publishable key>
SUPABASE_SERVICE_ROLE_KEY=<service_role / secret key>
```

`SUPABASE_SERVICE_ROLE_KEY` is a server-only secret. Never prefix it with `NEXT_PUBLIC_`.

### 3. Create the database

```bash
npm run setup
```

With `SUPABASE_DB_URL` set in `.env.local`, this applies the schema and the seed for you and is safe
to re-run. Without it, the script prints the two files to paste into the Supabase **SQL Editor**:
`supabase/migrations/0001_init.sql` then `supabase/seed.sql`. With the Supabase CLI instead:

```bash
supabase db push
supabase db execute --file supabase/seed.sql
```

The migration enables row level security, grants each role the minimum it needs, and adds
`sessions`, `student_participants` and `strategy_submissions` to the realtime publication.

> Self-hosting Postgres rather than using Supabase? Make sure `service_role` has `BYPASSRLS`
> (`alter role service_role bypassrls;`) or every student write will be refused.

### 4. Create an instructor account

Set `INSTRUCTOR_EMAIL` and `INSTRUCTOR_PASSWORD` in `.env.local` and `npm run setup` creates the
account already confirmed. Otherwise open `/instructor/login` and choose **Create an instructor
account** — then either turn off *Confirm email* under **Authentication → Providers → Email**, or
confirm the user under **Authentication → Users**.

### 5. Run

```bash
npm run dev          # http://localhost:3000
```

| Command | |
| --- | --- |
| `npm run setup` | ask for credentials if needed, apply the schema, seed the problem, create the instructor account |
| `npm run setup -- --reconfigure` | re-run the credential questions |
| `npm run demo` | create a finished demo class to look around in |
| `npm run dev` | development server |
| `npm run build` / `npm start` | production build and serve |
| `npm test` | run the test suite |
| `npm run test:watch` | watch mode |
| `npm run typecheck` | TypeScript, no emit |

---

## Running the activity

1. **Create a session.** `/instructor` → choose the problem, the duration (default **15 minutes**;
   5/10/15/20 or custom) and which strategies to enable. You get a five-character code.
2. **Project the dashboard.** Students go to `/join`, enter the code, their name and student ID, and
   appear on your board immediately.
3. **Press "Start Activity".** Everybody's clock starts at the same instant. You can pause, resume,
   add +1 or +5 minutes, or end early.
4. **Watch the board.** Cells show *Not started / In progress / Submitted* — progress only, never
   correctness, so the board is safe to leave on screen.
5. **At zero**, submissions freeze. Turn on **Allow late submission** to keep accepting them; those
   are clearly marked `LATE`.
6. **Press "Reveal Results".** This unlocks the class analytics and writes a durable record of how
   every answer scored.
7. **Teach.** Switch to **Teach Mode**, pick a strategy, press **Start Demonstration**, and advance
   with **Next Step** (or the arrow keys). **Projector Mode** enlarges everything and hides the
   dashboard chrome. Auto play exists but is off by default.

Session codes avoid characters that get misread from the back of a room: no `0/O`, `1/I/L`, `5/S`,
`8/B` or `6/G`.

### What you learn about each student

Click any student for their sequence against the correct one, position by position:

- exact match, correct prefix length, per-position accuracy, completion time
- **first divergence** — the position, what was expected, what they chose
- IDS compared **one depth limit at a time**

### Class analytics

Accuracy, exact-match rate and average correct prefix per strategy; where the class first went
wrong ("42% first diverged after node E"); the most common wrong node at the worst step;
completion-time distribution; and a clickable student × strategy matrix.

### Misconception detection

Rule-based, local, no AI and no external calls. Each submission is compared against a *simulation
of the actual mistake* rather than pattern-matched on strings, so the rules keep working when you
edit the graph:

- BFS answered depth-first, or DFS answered breadth-first
- stopping as soon as the goal is **generated** rather than expanded
- UCS ordered by single **edge cost** instead of cumulative `g(n)`
- IDS that does not restart from the start node
- IDS with the repeated nodes deduplicated away
- IDS run as a single depth-limited search, or expanding nodes that sit at the limit
- the **solution path** submitted instead of the search order
- the goal node missing from the sequence

Findings are shown to the instructor only, always phrased as *"Possible misconception"*. They are
evidence, not a diagnosis.

> On the default graph, ordering by edge cost happens to produce the same sequence as correct UCS,
> so that particular misconception is **not reported there** — reporting it would be a guess dressed
> up as a finding. It fires on graphs where the two genuinely differ. If you want to catch it, edit
> the graph so a node reached by a cheap edge from an expensive parent competes with one reached by
> an expensive edge from a cheap parent.

---

## Editing the activity

**Settings** lets you rename the activity, change the start and goal nodes, edit edge costs,
**reorder children** (the ↑ ↓ buttons — this changes every answer), set the timer and enable or
disable strategies, with live validation and a preview.

Editing is blocked while the activity is running: the answer key is derived from the problem, so
changing an edge cost mid-run would silently re-mark work students had already submitted. Each
session also stores a **frozen copy** of its problem, so editing a template later never invalidates
past sessions.

---

## Tests

```bash
npm test
```

140 tests. The important ones pin the conventions the activity grades:

- **Canonical answers** for all four strategies on the default problem.
- **BFS** drains the queue from the front; new children go to the back; shallower before deeper.
- **DFS** pushes children in reverse so the leftmost sits on top; the whole of `A`'s subtree
  finishes before `B` starts.
- **UCS** expands in non-decreasing `g(n)`; `g(child) = g(parent) + edge cost`; the queue stays
  sorted by cumulative cost; **the goal is generated well before it is expanded**, with `H` expanded
  in between precisely because `G` is not the cheapest yet; ties break by insertion order; a cheaper
  path found later still wins.
- **IDS** restarts from the start node at every limit; repeated nodes are kept (`S` appears three
  times, 14 processing events across 9 distinct nodes); each iteration equals a plain DLS run at
  that limit; a goalless problem still terminates.
- **DLS** processes nodes *at* the limit but does not expand them.
- The engine is generic: every strategy is also run on unrelated graphs.
- Scoring, misconception rules (including that they stay silent on correct work), class statistics,
  timer arithmetic and API input validation.

The schema is validated separately by running the migration and seed against a real PostgreSQL
instance and asserting the RLS behaviour in the table above.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project** and import it. The framework is detected automatically.
3. Add all three environment variables from `.env.local` under **Settings → Environment Variables**
   (Production, Preview and Development). Only `SUPABASE_SERVICE_ROLE_KEY` must stay secret.
4. Deploy.
5. In Supabase under **Authentication → URL Configuration**, set **Site URL** to your Vercel domain
   so instructor sign-in redirects correctly.

No other configuration is needed: the app is a standard Next.js App Router project with no custom
server, no background workers and no cron.

---

## Design notes

Light mode only. White ground, near-black text, one accent colour, hairline borders, no gradients
and no decorative motion. The state-space diagram is the strongest element on every page; everything
else stays quiet.

The student page is built for a phone held in one hand: 52px node buttons, a sticky header carrying
the timer and progress, and a fixed submit bar. The dashboard is built for a projector.

Correctness is **never** carried by colour alone — every cell also has a mark (`✓ ~ ✗ –`), a text
label and a screen-reader description. Controls are keyboard operable, the demonstration advances
with the arrow keys, and the countdown uses tabular figures so it does not jitter.

---

## Licence

Written for classroom use. Adapt it freely for your own course.
