-- NC House Flip Studio — RLS policies

-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.deal_comments enable row level security;
alter table public.property_data enable row level security;
alter table public.comps enable row level security;
alter table public.underwriting enable row level security;
alter table public.contractors enable row level security;
alter table public.rehab_items enable row level security;
alter table public.change_orders enable row level security;
alter table public.documents enable row level security;
alter table public.ai_analyses enable row level security;

-- Helper: current user's org id
create or replace function public.current_org_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- Helper: is the current user a member of the given org?
create or replace function public.is_org_member(check_org_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and org_id = check_org_id
  );
$$;

-- organizations: members can read their org
create policy "org members can read their org"
  on public.organizations for select
  using (is_org_member(id));

-- profiles: members can read profiles in their org; users edit own profile
create policy "org members can read profiles"
  on public.profiles for select
  using (org_id = current_org_id());

create policy "users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- deals: org-members CRUD
create policy "org members can select deals"
  on public.deals for select
  using (is_org_member(org_id));

create policy "org members can insert deals"
  on public.deals for insert
  with check (is_org_member(org_id));

create policy "org members can update deals"
  on public.deals for update
  using (is_org_member(org_id));

create policy "org members can delete deals"
  on public.deals for delete
  using (is_org_member(org_id));

-- deal_comments: org members can read; users can insert/update/delete only their own
create policy "org members can select comments"
  on public.deal_comments for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "users can insert own comments"
  on public.deal_comments for insert
  with check (auth.uid() = user_id);

create policy "users can update own comments"
  on public.deal_comments for update
  using (auth.uid() = user_id);

create policy "users can delete own comments"
  on public.deal_comments for delete
  using (auth.uid() = user_id);

-- property_data: org-members CRUD via parent deal
create policy "org members can select property_data"
  on public.property_data for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can insert property_data"
  on public.property_data for insert
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can update property_data"
  on public.property_data for update
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can delete property_data"
  on public.property_data for delete
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

-- comps: org-members CRUD via parent deal
create policy "org members can select comps"
  on public.comps for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can insert comps"
  on public.comps for insert
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can update comps"
  on public.comps for update
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can delete comps"
  on public.comps for delete
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

-- underwriting: org-members CRUD via parent deal
create policy "org members can select underwriting"
  on public.underwriting for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can insert underwriting"
  on public.underwriting for insert
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can update underwriting"
  on public.underwriting for update
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can delete underwriting"
  on public.underwriting for delete
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

-- contractors: org-members CRUD
create policy "org members can select contractors"
  on public.contractors for select
  using (is_org_member(org_id));

create policy "org members can insert contractors"
  on public.contractors for insert
  with check (is_org_member(org_id));

create policy "org members can update contractors"
  on public.contractors for update
  using (is_org_member(org_id));

create policy "org members can delete contractors"
  on public.contractors for delete
  using (is_org_member(org_id));

-- rehab_items: org-members CRUD
create policy "org members can select rehab_items"
  on public.rehab_items for select
  using (is_org_member(org_id));

create policy "org members can insert rehab_items"
  on public.rehab_items for insert
  with check (is_org_member(org_id));

create policy "org members can update rehab_items"
  on public.rehab_items for update
  using (is_org_member(org_id));

create policy "org members can delete rehab_items"
  on public.rehab_items for delete
  using (is_org_member(org_id));

-- change_orders: org-members CRUD via parent rehab item
create policy "org members can select change_orders"
  on public.change_orders for select
  using (
    exists (
      select 1 from public.rehab_items ri
      where ri.id = rehab_item_id and is_org_member(ri.org_id)
    )
  );

create policy "org members can insert change_orders"
  on public.change_orders for insert
  with check (
    exists (
      select 1 from public.rehab_items ri
      where ri.id = rehab_item_id and is_org_member(ri.org_id)
    )
  );

create policy "org members can update change_orders"
  on public.change_orders for update
  using (
    exists (
      select 1 from public.rehab_items ri
      where ri.id = rehab_item_id and is_org_member(ri.org_id)
    )
  );

create policy "org members can delete change_orders"
  on public.change_orders for delete
  using (
    exists (
      select 1 from public.rehab_items ri
      where ri.id = rehab_item_id and is_org_member(ri.org_id)
    )
  );

-- documents: org-members CRUD
create policy "org members can select documents"
  on public.documents for select
  using (is_org_member(org_id));

create policy "org members can insert documents"
  on public.documents for insert
  with check (is_org_member(org_id));

create policy "org members can update documents"
  on public.documents for update
  using (is_org_member(org_id));

create policy "org members can delete documents"
  on public.documents for delete
  using (is_org_member(org_id));

-- ai_analyses: org-members CRUD via parent deal
create policy "org members can select ai_analyses"
  on public.ai_analyses for select
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can insert ai_analyses"
  on public.ai_analyses for insert
  with check (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can update ai_analyses"
  on public.ai_analyses for update
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );

create policy "org members can delete ai_analyses"
  on public.ai_analyses for delete
  using (
    exists (
      select 1 from public.deals d
      where d.id = deal_id and is_org_member(d.org_id)
    )
  );
