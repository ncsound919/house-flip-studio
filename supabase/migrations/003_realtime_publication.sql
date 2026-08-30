-- Enable realtime for the tables the Kanban board and dashboards subscribe to.
-- Without adding tables to the supabase_realtime publication, postgres_changes
-- events are never emitted even when RLS policies allow them (see
-- supabase/supabase#35195).

alter publication supabase_realtime add table public.deals;
alter publication supabase_realtime add table public.deal_comments;
alter publication supabase_realtime add table public.rehab_items;
alter publication supabase_realtime add table public.change_orders;
alter publication supabase_realtime add table public.contractors;
alter publication supabase_realtime add table public.documents;
