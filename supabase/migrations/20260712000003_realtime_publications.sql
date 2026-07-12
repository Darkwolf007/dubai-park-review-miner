-- Steps 17e / 19: adds tables to the supabase_realtime publication as each feature actually
-- needed live updates -- connecting to a channel for a table not in this publication succeeds
-- (status SUBSCRIBED) but silently delivers zero events, which is a real debugging trap.

alter publication supabase_realtime add table public.analysis_runs;
alter publication supabase_realtime add table public.datasets;
