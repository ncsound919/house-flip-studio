-- 004_contractors_verified_at.sql
alter table public.contractors
  add column if not exists verified_at timestamptz;
