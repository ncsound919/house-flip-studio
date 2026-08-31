-- Phase 1: research dossiers + per-source fetch tracking.

-- One dossier per deal — the compiled research record.
create table if not exists public.dossiers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations (id) on delete cascade,
  deal_id uuid references public.deals (id) on delete cascade,
  sources jsonb not null default '[]'::jsonb,
  compiled_at timestamptz not null default now(),
  unique (deal_id)
);

create index if not exists dossiers_org_idx on public.dossiers (org_id, compiled_at desc);

-- Per-source fetch log — one row per source per dossier build, so we never
-- re-hit external APIs blindly and failures are auditable.
create table if not exists public.research_sources (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid references public.dossiers (id) on delete cascade,
  source text not null,
  status text not null, -- 'ok' | 'error'
  data jsonb,
  error text,
  fetched_at timestamptz not null default now()
);

create index if not exists research_sources_dossier_idx on public.research_sources (dossier_id);