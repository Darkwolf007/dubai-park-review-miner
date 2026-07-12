-- Step 22: dataset lineage & reproducibility. analysis_runs.input_dataset_ids records WHICH
-- datasets fed a run but not WHICH VERSION of each was current at that moment -- if a dataset
-- gets reprocessed later, you can no longer tell what an earlier run actually used. This table +
-- trigger auto-pins the exact dataset_version for every input, on every run, with no caller able
-- to forget it (it's not a service-layer call, it's a DB trigger).

create table public.analysis_run_inputs (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  dataset_id uuid not null references public.datasets(id) on delete cascade,
  dataset_version_id uuid not null references public.dataset_versions(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (analysis_run_id, dataset_id)
);

create or replace function public.pin_analysis_run_input_versions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.analysis_run_inputs (analysis_run_id, dataset_id, dataset_version_id, project_id)
  select new.id, d.id, dv.id, new.project_id
  from unnest(new.input_dataset_ids) as ds(dataset_id)
  join public.datasets d on d.id = ds.dataset_id
  join public.dataset_versions dv on dv.dataset_id = d.id and dv.is_current = true;
  return new;
end;
$$;

create trigger trg_pin_analysis_run_input_versions
after insert on public.analysis_runs
for each row execute function public.pin_analysis_run_input_versions();

alter table public.analysis_run_inputs enable row level security;

-- No insert/update/delete policy for end users -- only the trigger ever writes here, immutable
-- history like analysis_metrics.
create policy "analysis_run_inputs_select"
on public.analysis_run_inputs for select
to public
using (is_public_access_enabled() or user_owns_project(project_id));
