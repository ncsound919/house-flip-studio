-- Phase 5: bank-readiness — company books.
-- Three org-scoped tables feeding the Lender section:
--   company_accounts  — balance-sheet ledger (manual entries, honest)
--   debts             — debt schedule (bank loans, HELOCs, hard money, notes)
--   entity_documents  — entity documents vault (LLC, EIN, insurance, taxes)
-- RLS policies mirror migration 011. Server code uses the service-role key.

-- Balance sheet accounts. Equity is NOT entered here to be authoritative — the
-- statement computes equity as the plug (assets - liabilities) and labels it.
create type account_type as enum ('cash', 'receivable', 'other_asset', 'liability', 'equity');

create table if not exists public.company_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  account_name text not null,
  account_type account_type not null,
  balance numeric not null default 0,
  as_of date not null default current_date,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists company_accounts_org_idx on public.company_accounts (org_id);

-- Debt schedule. collateral_deal_id links a loan to the property it's secured by.
create type debt_kind as enum ('heloc', 'hard_money', 'note', 'construction', 'credit_card', 'other');

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  lender text not null,
  kind debt_kind not null default 'other',
  balance numeric not null default 0,
  interest_rate numeric,
  monthly_payment numeric,
  maturity_date date,
  collateral_deal_id uuid references public.deals (id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists debts_org_idx on public.debts (org_id);

-- Entity documents vault. Reuses the existing doc_status enum.
create type entity_doc_type as enum (
  'operating_agreement',
  'ein_letter',
  'business_license',
  'insurance_cert',
  'banking_agreement',
  'tax_return',
  'financial_statement',
  'other'
);

create table if not exists public.entity_documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  doc_type entity_doc_type not null,
  status doc_status not null default 'missing',
  notes text,
  file_url text,
  received_at date,
  created_at timestamptz not null default now()
);

create index if not exists entity_documents_org_idx on public.entity_documents (org_id);

-- ---- RLS ----

alter table public.company_accounts enable row level security;
alter table public.debts enable row level security;
alter table public.entity_documents enable row level security;

create policy "org members can select company_accounts"
  on public.company_accounts for select
  using (is_org_member(org_id));

create policy "org members can insert company_accounts"
  on public.company_accounts for insert
  with check (is_org_member(org_id));

create policy "org members can update company_accounts"
  on public.company_accounts for update
  using (is_org_member(org_id));

create policy "org members can delete company_accounts"
  on public.company_accounts for delete
  using (is_org_member(org_id));

create policy "org members can select debts"
  on public.debts for select
  using (is_org_member(org_id));

create policy "org members can insert debts"
  on public.debts for insert
  with check (is_org_member(org_id));

create policy "org members can update debts"
  on public.debts for update
  using (is_org_member(org_id));

create policy "org members can delete debts"
  on public.debts for delete
  using (is_org_member(org_id));

create policy "org members can select entity_documents"
  on public.entity_documents for select
  using (is_org_member(org_id));

create policy "org members can insert entity_documents"
  on public.entity_documents for insert
  with check (is_org_member(org_id));

create policy "org members can update entity_documents"
  on public.entity_documents for update
  using (is_org_member(org_id));

create policy "org members can delete entity_documents"
  on public.entity_documents for delete
  using (is_org_member(org_id));
