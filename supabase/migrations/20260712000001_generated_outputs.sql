-- Step 20: generated_outputs table -- records every file an analysis run produces
-- (GeoJSON/GeoPackage/CSV/Excel/GeoTIFF/JSON/PDF/PNG), tied back to the run that made it.

create table public.generated_outputs (
  id uuid primary key default gen_random_uuid(),
  analysis_run_id uuid not null references public.analysis_runs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  output_type text not null check (output_type in ('geojson', 'geopackage', 'csv', 'excel', 'geotiff', 'json', 'pdf', 'png')),
  name text not null,
  storage_bucket text not null,
  storage_path text not null,
  file_size_bytes bigint,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Same denormalization pattern as analysis_metrics: project_id/owner_id are filled from the
-- parent run automatically, so RLS policies below can filter without a join on every read.
create or replace function public.set_generated_output_project_from_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select project_id, owner_id into new.project_id, new.owner_id
  from public.analysis_runs
  where id = new.analysis_run_id;
  return new;
end;
$$;

create trigger trg_set_generated_output_project_from_run
before insert on public.generated_outputs
for each row execute function public.set_generated_output_project_from_run();

alter table public.generated_outputs enable row level security;

-- Append-only, same immutable-history philosophy as analysis_metrics/dataset_versions: no
-- update/delete policy. Re-running an analysis produces new output rows, never overwrites old ones.
create policy "generated_outputs_select"
on public.generated_outputs for select
to public
using (
  is_public_access_enabled()
  or user_owns_project(project_id)
);

create policy "generated_outputs_insert"
on public.generated_outputs for insert
to public
with check (
  is_public_access_enabled()
  or user_owns_project(project_id)
);
