-- Step 23: grasshopper-exports bucket had no policy at all. Unlike analysis-outputs/reports/
-- map-images (backend/service_role-only writes), the frontend writes here directly -- Grasshopper
-- exports are computed synchronously client-side (grasshopperExportEngine.ts) with no backend job.

create policy "grasshopper_exports_select"
on storage.objects for select
to public
using (
  bucket_id = 'grasshopper-exports'
  and (is_public_access_enabled() or user_owns_project((storage.foldername(name))[1]::uuid))
);

create policy "grasshopper_exports_insert"
on storage.objects for insert
to public
with check (
  bucket_id = 'grasshopper-exports'
  and (is_public_access_enabled() or user_owns_project((storage.foldername(name))[1]::uuid))
);
