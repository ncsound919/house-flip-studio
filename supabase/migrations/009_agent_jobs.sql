-- Phase 3: async agent jobs for slow research work (dossiers, comps).
create table if not exists public.agent_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  kind text not null,          -- 'fetch_dossier' | 'fetch_comps' | 'predict_exit'
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending', -- 'pending' | 'running' | 'done' | 'failed'
  attempts int not null default 0,
  error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index if not exists agent_jobs_pending_idx
  on public.agent_jobs (org_id, status, created_at);

-- Phase 3: rehab payment/draw ledger.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  rehab_item_id uuid references public.rehab_items (id) on delete cascade,
  amount numeric not null,
  status text not null default 'recorded', -- 'recorded' | 'approved' | 'paid'
  description text,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

create index if not exists payments_deal_idx on public.payments (deal_id, created_at);