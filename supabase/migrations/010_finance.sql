-- Phase 4: per-deal finance snapshot (P&L), deterministic and labeled.
create table if not exists public.finance (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  pnl jsonb not null,                  -- computeDealPnl output
  snapshot_at timestamptz not null default now(),
  unique (deal_id)
);

create index if not exists finance_org_idx on public.finance (org_id, snapshot_at desc);

-- Phase 4: realized sale price on deals. Left null unless the operator sets a
-- real number — do NOT auto-fill from asking price (HONESTY: asking price is not
-- a sale price).
alter table public.deals
  add column if not exists final_sale_price numeric;