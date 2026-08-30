-- NC House Flip Studio — initial schema

-- Enums
create type deal_stage as enum ('Lead', 'Inspecting', 'Underwriting', 'Offer Made', 'Under Contract', 'Rehab', 'Listed', 'Closed');
create type deal_source as enum ('manual', 'county_gis', 'api');
create type rehab_status as enum ('estimated', 'contracted', 'in_progress', 'completed');
create type change_order_status as enum ('approved', 'pending', 'rejected');
create type doc_type as enum ('permit', 'contractor_quote', 'signed_contract', 'draw_request', 'conditional_lien_waiver', 'unconditional_lien_waiver', 'w9', 'insurance_cert');
create type doc_status as enum ('missing', 'requested', 'received', 'filed');
create type ai_analysis_type as enum ('photo', 'scope', 'repair_guide');
create type contractor_status as enum ('active', 'available', 'completed');

-- Organizations (simple two-person org for now)
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete set null,
  display_name text,
  role text not null default 'owner',
  created_at timestamptz not null default now()
);

-- Deals
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  address text not null,
  city text,
  state text not null default 'NC',
  zip text,
  photo_url text,
  stage deal_stage not null default 'Lead',
  stage_changed_at timestamptz not null default now(),
  source deal_source not null default 'manual',
  asking_price numeric,
  sqft numeric,
  beds integer,
  baths numeric,
  year_built integer,
  lot_size text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Deal comments
create table if not exists public.deal_comments (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);

-- Property data snapshots (from county GIS or manual entry)
create table if not exists public.property_data (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  source text not null default 'manual',
  data jsonb not null default '{}'::jsonb,
  fetched_at timestamptz not null default now()
);

-- Comps
create table if not exists public.comps (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  address text,
  sale_price numeric,
  sqft numeric,
  sale_date date,
  price_per_sqft numeric
);

-- Underwriting
create table if not exists public.underwriting (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  arv numeric,
  rehab_estimate numeric,
  purchase_price numeric,
  holding_months numeric default 6,
  down_payment_pct numeric default 20,
  interest_rate numeric default 10,
  loan_points numeric default 0,
  max_offer numeric,
  final_purchase_price numeric,
  passes_70_rule boolean,
  acquisition_costs numeric,
  holding_costs numeric,
  selling_costs numeric,
  financing_costs numeric,
  total_project_cost numeric,
  projected_profit numeric,
  roi numeric,
  cash_on_cash numeric,
  down_payment_amount numeric,
  loan_amount numeric,
  updated_at timestamptz not null default now()
);

-- Contractors
create table if not exists public.contractors (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  name text not null,
  trade text,
  phone text,
  email text,
  license_number text,
  license_board text,
  license_tier text,
  insurance_policy text,
  insurance_expiry date,
  insurance_limit numeric,
  workers_comp_verified boolean not null default false,
  w9_on_file boolean not null default false,
  notes text,
  status contractor_status not null default 'active',
  created_at timestamptz not null default now()
);

-- Rehab items
create table if not exists public.rehab_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  org_id uuid references public.organizations (id) on delete cascade,
  trade text,
  description text,
  contractor_id uuid references public.contractors (id) on delete set null,
  estimated_cost numeric default 0,
  actual_cost numeric default 0,
  status rehab_status not null default 'estimated',
  notes text,
  created_at timestamptz not null default now()
);

-- Change orders
create table if not exists public.change_orders (
  id uuid primary key default gen_random_uuid(),
  rehab_item_id uuid references public.rehab_items (id) on delete cascade,
  description text not null,
  cost_impact numeric not null default 0,
  reason text,
  status change_order_status not null default 'pending',
  created_at timestamptz not null default now()
);

-- Documents
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  rehab_item_id uuid references public.rehab_items (id) on delete set null,
  org_id uuid references public.organizations (id) on delete cascade,
  doc_type doc_type not null,
  status doc_status not null default 'missing',
  requested_at date,
  received_at date,
  notes text,
  created_at timestamptz not null default now()
);

-- AI analyses
create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals (id) on delete cascade,
  type ai_analysis_type not null,
  input_summary text,
  output_summary text,
  model_used text,
  created_at timestamptz not null default now()
);

-- Trigger: auto-create profile on auth.users insert
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_org_id uuid;
begin
  -- Assign to the first org, or create one if none exists.
  select id into v_org_id from public.organizations order by created_at limit 1;
  if v_org_id is null then
    insert into public.organizations (name)
    values ('Default Org')
    returning id into v_org_id;
  end if;

  insert into public.profiles (id, org_id, display_name, role)
  values (new.id, v_org_id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)), 'owner')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
