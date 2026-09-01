-- Phase 7: self-learning + trends — Draymond's learning-store pattern ported
-- natively into House Flip's stack (Supabase/Postgres), so the system stays
-- self-contained while learning from real outcomes.
--
--   learning_outcomes  — every closed deal / budget result / outreach result
--                        recorded as a discrete outcome (idempotent via event_key)
--   learning_lessons   — distilled lessons ("what worked / what broke") with
--                        evidence counts, clustered from outcomes
--   market_insights    — deterministic trend snapshots over time (ARV accuracy,
--                        rehab $/sqft, cycle time, profit accuracy)
-- Org-scoped; RLS mirrors migration 011.

create table if not exists public.learning_outcomes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  agent_id text not null default 'flip-system',
  kind text not null,                       -- 'calibration' | 'budget' | 'outreach' | ...
  success boolean not null,
  summary text not null,
  detail text,
  event_key text not null,                  -- idempotency key, e.g. 'calibration:<deal_id>'
  occurred_at timestamptz not null default now(),
  unique (org_id, event_key)
);

create index if not exists learning_outcomes_org_idx on public.learning_outcomes (org_id, occurred_at desc);

create table if not exists public.learning_lessons (
  id text primary key,                      -- 'ls_<slug>'
  org_id uuid references public.organizations (id) on delete cascade,
  agent_id text not null default 'flip-system',
  pattern text not null,
  lesson text not null,
  evidence_count int not null default 1,
  last_seen timestamptz not null default now(),
  unique (org_id, id)
);

create index if not exists learning_lessons_org_idx on public.learning_lessons (org_id, evidence_count desc);

create table if not exists public.market_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  metric text not null,                     -- 'arv_accuracy_pct' | 'rehab_per_sqft' | ...
  value numeric not null,
  sample_size int not null default 1,
  source text not null default 'calibration',
  window_start date,
  generated_at timestamptz not null default now()
);

create index if not exists market_insights_org_idx on public.market_insights (org_id, metric, generated_at desc);

-- ---- RLS ----

alter table public.learning_outcomes enable row level security;
alter table public.learning_lessons enable row level security;
alter table public.market_insights enable row level security;

create policy "org members can select learning_outcomes"
  on public.learning_outcomes for select
  using (is_org_member(org_id));

create policy "org members can insert learning_outcomes"
  on public.learning_outcomes for insert
  with check (is_org_member(org_id));

create policy "org members can update learning_outcomes"
  on public.learning_outcomes for update
  using (is_org_member(org_id));

create policy "org members can delete learning_outcomes"
  on public.learning_outcomes for delete
  using (is_org_member(org_id));

create policy "org members can select learning_lessons"
  on public.learning_lessons for select
  using (is_org_member(org_id));

create policy "org members can insert learning_lessons"
  on public.learning_lessons for insert
  with check (is_org_member(org_id));

create policy "org members can update learning_lessons"
  on public.learning_lessons for update
  using (is_org_member(org_id));

create policy "org members can delete learning_lessons"
  on public.learning_lessons for delete
  using (is_org_member(org_id));

create policy "org members can select market_insights"
  on public.market_insights for select
  using (is_org_member(org_id));

create policy "org members can insert market_insights"
  on public.market_insights for insert
  with check (is_org_member(org_id));

create policy "org members can update market_insights"
  on public.market_insights for update
  using (is_org_member(org_id));

create policy "org members can delete market_insights"
  on public.market_insights for delete
  using (is_org_member(org_id));
