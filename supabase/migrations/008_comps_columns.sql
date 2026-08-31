-- Phase 2: comps provenance + recency so ARV can weigh real sales.
alter table public.comps
  add column if not exists source text,        -- 'deeds' | 'rentcast' | 'manual'
  add column if not exists sale_date date,
  add column if not exists distance_score numeric;

create index if not exists comps_deal_sale_idx on public.comps (deal_id, sale_date desc);