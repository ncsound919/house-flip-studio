-- Agent runs + actions audit log + ARV columns on deals.

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  trigger text not null default 'manual', -- 'manual' | 'scheduled'
  status text not null default 'completed', -- 'completed' | 'partial' | 'failed'
  summary jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists agent_runs_org_started_idx
  on public.agent_runs (org_id, started_at desc);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  run_id uuid references public.agent_runs (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete set null,
  contractor_id uuid references public.contractors (id) on delete set null,
  action_type text not null,
  status text not null default 'done', -- 'done' | 'skipped' | 'blocked' | 'failed' | 'pending_approval' | 'approved'
  title text not null,
  detail text,
  requires_approval boolean not null default false,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_actions_org_created_idx
  on public.agent_actions (org_id, created_at desc);

create index if not exists agent_actions_org_pending_idx
  on public.agent_actions (org_id, requires_approval)
  where status = 'pending_approval';

-- ARV / assessed-value columns on deals so the agent has the inputs it needs.
alter table public.deals
  add column if not exists assessed_value numeric;

alter table public.deals
  add column if not exists arv_estimate numeric;

alter table public.deals
  add column if not exists arv_method text;

alter table public.deals
  add column if not exists arv_estimate_at timestamptz;
