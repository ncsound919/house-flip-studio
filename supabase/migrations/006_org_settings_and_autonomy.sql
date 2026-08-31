-- Autonomy deepening: org settings, RFQ drafts, contractor license check tracking.

-- Per-org operator settings (budget band, underwriting assumptions, agent policy).
-- Single JSONB row per org; zod schema in src/lib/orgSettings.ts is the source of truth.
create table if not exists public.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- RFQ drafts produced by the autonomous agent. Draft-only — sending stays money-gated.
create table if not exists public.rfq_drafts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  contractor_id uuid references public.contractors (id) on delete cascade,
  rehab_item_ids jsonb not null default '[]'::jsonb,
  draft_text text not null,
  status text not null default 'draft', -- 'draft' | 'sent'
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists rfq_drafts_org_created_idx
  on public.rfq_drafts (org_id, created_at desc);

create index if not exists rfq_drafts_deal_idx
  on public.rfq_drafts (deal_id);

-- One draft per deal+contractor pair; prevents overlapping agent runs from
-- drafting the same RFQ twice (the planner dedupes on this too).
create unique index if not exists rfq_drafts_deal_contractor_idx
  on public.rfq_drafts (deal_id, contractor_id);

-- When the agent last checked a contractor's license (every attempt), vs verified_at
-- (only set on a real nclbgc active result). Prevents hammering nclbgc every cycle.
alter table public.contractors
  add column if not exists license_checked_at timestamptz;