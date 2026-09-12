-- ===========================================================================
-- Seed: the built-in "Campus Delivery Robot" classroom problem.
--
-- Safe to run repeatedly. Instructors get this template offered by default
-- when they create a session.
--
-- IMPORTANT: the order of the `edges` array IS the left-to-right child order.
--   Children(S) = [A, B, C]
--   Children(A) = [D, E]
--   Children(B) = [F]
--   Children(C) = [H, G]
-- Re-ordering this array changes every canonical answer.
-- ===========================================================================

insert into public.state_space_problems
  (id, owner_id, name, story, start_node, goal_node, nodes, edges, depth_limit, is_template)
values (
  '00000000-0000-4000-8000-000000000001',
  null,
  'Campus Delivery Robot',
  'A delivery robot starts at the Main Gate (S) and must reach the AI Lab (G). Edge costs are travel times between campus locations.',
  'S',
  'G',
  '[
    { "id": "S", "label": "Main Gate" },
    { "id": "A", "label": "Library" },
    { "id": "B", "label": "Student Center" },
    { "id": "C", "label": "Engineering Building" },
    { "id": "D", "label": "Study Hall" },
    { "id": "E", "label": "Media Lab" },
    { "id": "F", "label": "Coffee Point" },
    { "id": "H", "label": "Robotics Lab" },
    { "id": "G", "label": "AI Lab" }
  ]'::jsonb,
  '[
    { "from": "S", "to": "A", "cost": 4 },
    { "from": "S", "to": "B", "cost": 1 },
    { "from": "S", "to": "C", "cost": 8 },
    { "from": "A", "to": "D", "cost": 1 },
    { "from": "A", "to": "E", "cost": 3 },
    { "from": "B", "to": "F", "cost": 2 },
    { "from": "C", "to": "H", "cost": 1 },
    { "from": "C", "to": "G", "cost": 3 }
  ]'::jsonb,
  2,
  true
)
on conflict (id) do update set
  name       = excluded.name,
  story      = excluded.story,
  start_node = excluded.start_node,
  goal_node  = excluded.goal_node,
  nodes      = excluded.nodes,
  edges      = excluded.edges,
  depth_limit = excluded.depth_limit,
  is_template = excluded.is_template;
