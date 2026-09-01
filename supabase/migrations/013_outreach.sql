-- Phase 6: acquisition outreach — the execution layer of the acquisition loop.
-- Every contact with a property owner is a row: offer letters, follow-ups,
-- counters, inbound replies. The cadence engine decides WHAT to do next per
-- lead from this log; the funnel engine aggregates it into conversion numbers.
-- Org-scoped; RLS mirrors migration 011.

create type outreach_channel as enum ('email', 'mail', 'phone', 'in_person');
create type outreach_direction as enum ('outbound', 'inbound');
create type outreach_kind as enum ('initial_offer', 'follow_up', 'counter', 'inquiry', 'note');
create type outreach_response as enum ('none', 'no_interest', 'counter', 'accepted', 'undeliverable');

create table if not exists public.outreach (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  kind outreach_kind not null default 'note',
  channel outreach_channel not null default 'email',
  direction outreach_direction not null default 'outbound',
  subject text,
  body text,
  offer_amount numeric,
  valid_until date,
  -- draft = ready but NOT actually delivered (manual send or no email key);
  -- sent = provider confirmed delivery; failed = transport error.
  status text not null default 'draft',
  response outreach_response not null default 'none',
  response_note text,
  provider_id text,
  sent_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists outreach_org_deal_idx on public.outreach (org_id, deal_id, created_at desc);
create index if not exists outreach_org_due_idx on public.outreach (org_id, status, response);

-- ---- RLS ----

alter table public.outreach enable row level security;

create policy "org members can select outreach"
  on public.outreach for select
  using (is_org_member(org_id));

create policy "org members can insert outreach"
  on public.outreach for insert
  with check (is_org_member(org_id));

create policy "org members can update outreach"
  on public.outreach for update
  using (is_org_member(org_id));

create policy "org members can delete outreach"
  on public.outreach for delete
  using (is_org_member(org_id));
