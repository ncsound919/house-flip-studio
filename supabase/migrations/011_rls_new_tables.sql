-- Phase 1–4 tables were created without RLS. Enable RLS + org-scoped policies
-- to match migration 002. Server code uses the service-role key (bypasses RLS);
-- these policies protect the tables from anon/authenticated clients.

alter table public.org_settings enable row level security;
alter table public.rfq_drafts enable row level security;
alter table public.dossiers enable row level security;
alter table public.research_sources enable row level security;
alter table public.agent_jobs enable row level security;
alter table public.payments enable row level security;
alter table public.finance enable row level security;

-- org_settings: org members read/update their own row (inserts via service role).
create policy "org members can select org_settings"
  on public.org_settings for select
  using (is_org_member(org_id));

create policy "org members can update org_settings"
  on public.org_settings for update
  using (is_org_member(org_id));

-- rfq_drafts: org-members CRUD via org_id.
create policy "org members can select rfq_drafts"
  on public.rfq_drafts for select
  using (is_org_member(org_id));

create policy "org members can insert rfq_drafts"
  on public.rfq_drafts for insert
  with check (is_org_member(org_id));

create policy "org members can update rfq_drafts"
  on public.rfq_drafts for update
  using (is_org_member(org_id));

create policy "org members can delete rfq_drafts"
  on public.rfq_drafts for delete
  using (is_org_member(org_id));

-- dossiers: org-members CRUD via org_id.
create policy "org members can select dossiers"
  on public.dossiers for select
  using (is_org_member(org_id));

create policy "org members can insert dossiers"
  on public.dossiers for insert
  with check (is_org_member(org_id));

create policy "org members can update dossiers"
  on public.dossiers for update
  using (is_org_member(org_id));

create policy "org members can delete dossiers"
  on public.dossiers for delete
  using (is_org_member(org_id));

-- research_sources: org-members CRUD via parent dossier.
create policy "org members can select research_sources"
  on public.research_sources for select
  using (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id and is_org_member(d.org_id)
    )
  );

create policy "org members can insert research_sources"
  on public.research_sources for insert
  with check (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id and is_org_member(d.org_id)
    )
  );

create policy "org members can update research_sources"
  on public.research_sources for update
  using (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id and is_org_member(d.org_id)
    )
  );

create policy "org members can delete research_sources"
  on public.research_sources for delete
  using (
    exists (
      select 1 from public.dossiers d
      where d.id = dossier_id and is_org_member(d.org_id)
    )
  );

-- agent_jobs: org-members CRUD via org_id.
create policy "org members can select agent_jobs"
  on public.agent_jobs for select
  using (is_org_member(org_id));

create policy "org members can insert agent_jobs"
  on public.agent_jobs for insert
  with check (is_org_member(org_id));

create policy "org members can update agent_jobs"
  on public.agent_jobs for update
  using (is_org_member(org_id));

create policy "org members can delete agent_jobs"
  on public.agent_jobs for delete
  using (is_org_member(org_id));

-- payments: org-members CRUD via org_id.
create policy "org members can select payments"
  on public.payments for select
  using (is_org_member(org_id));

create policy "org members can insert payments"
  on public.payments for insert
  with check (is_org_member(org_id));

create policy "org members can update payments"
  on public.payments for update
  using (is_org_member(org_id));

create policy "org members can delete payments"
  on public.payments for delete
  using (is_org_member(org_id));

-- finance: org-members CRUD via org_id.
create policy "org members can select finance"
  on public.finance for select
  using (is_org_member(org_id));

create policy "org members can insert finance"
  on public.finance for insert
  with check (is_org_member(org_id));

create policy "org members can update finance"
  on public.finance for update
  using (is_org_member(org_id));

create policy "org members can delete finance"
  on public.finance for delete
  using (is_org_member(org_id));