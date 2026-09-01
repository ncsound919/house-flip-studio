-- Phase 8: capital stack — how deals are funded (operator equity + partner
-- capital). Senior debt already lives in `debts` (collateral_deal_id links it to
-- a deal), so this table models only the non-debt layers. The waterfall engine
-- combines `debts` + this table to compute returns on exit.
-- Org-scoped; RLS mirrors migration 011.

create type capital_source_type as enum ('operator_equity', 'partner_capital');

create table if not exists public.capital_contributions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  source_type capital_source_type not null default 'operator_equity',
  source_name text not null,               -- 'self' or partner/investor name
  amount numeric not null default 0,
  -- annual rate for partner preferred return (%), 0 for pure operator equity
  annual_rate numeric not null default 0,
  priority int not null default 0,         -- waterfall seniority (0 = paid first)
  status text not null default 'active',   -- 'active' | 'repaid' | 'written_off'
  funded_at date,
  created_at timestamptz not null default now()
);

create index if not exists capital_contributions_org_idx on public.capital_contributions (org_id, deal_id);

-- ---- RLS ----

alter table public.capital_contributions enable row level security;

create policy "org members can select capital_contributions"
  on public.capital_contributions for select
  using (is_org_member(org_id));

create policy "org members can insert capital_contributions"
  on public.capital_contributions for insert
  with check (is_org_member(org_id));

create policy "org members can update capital_contributions"
  on public.capital_contributions for update
  using (is_org_member(org_id));

create policy "org members can delete capital_contributions"
  on public.capital_contributions for delete
  using (is_org_member(org_id));
