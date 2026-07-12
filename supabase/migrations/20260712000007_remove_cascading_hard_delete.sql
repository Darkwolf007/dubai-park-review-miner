-- Step 24: critical fix. projects and datasets both allowed anonymous hard DELETE. Every
-- downstream table (dataset_versions, analysis_runs, analysis_metrics, generated_outputs,
-- analysis_run_inputs) correctly blocks *direct* anonymous deletes, but that was irrelevant --
-- deleting the PARENT project/dataset row cascades through all of it via foreign keys, which run
-- with the database's own privileges, not the requester's. Verified live: a full
-- project -> dataset -> version -> run -> metric chain was completely destroyed by one anon
-- DELETE on the project, despite every child table's own RLS "protecting" it.
--
-- Soft delete already works (projects.status = 'deleted', already filtered by fetchProjects()),
-- so removing hard-delete costs no functionality. Any future hard-delete need should go through
-- the backend's service_role client, which bypasses RLS by design, never a direct table delete
-- from the frontend.

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'projects' and cmd = 'DELETE'
  loop
    execute format('drop policy %I on public.projects', pol.policyname);
  end loop;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'datasets' and cmd = 'DELETE'
  loop
    execute format('drop policy %I on public.datasets', pol.policyname);
  end loop;
end $$;
