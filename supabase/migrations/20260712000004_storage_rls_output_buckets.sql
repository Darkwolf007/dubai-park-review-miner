-- Step 20 fix: same class of gap as raw-datasets -- analysis-outputs/reports/map-images had no
-- SELECT policy, so generated_outputs rows were readable but the actual files 404'd for the
-- frontend. Only SELECT is needed: the backend's service_role client writes here and bypasses
-- RLS entirely, the frontend only ever reads.

create policy "analysis_outputs_select"
on storage.objects for select
to public
using (
  bucket_id = 'analysis-outputs'
  and (is_public_access_enabled() or user_owns_project((storage.foldername(name))[1]::uuid))
);

create policy "reports_select"
on storage.objects for select
to public
using (
  bucket_id = 'reports'
  and (is_public_access_enabled() or user_owns_project((storage.foldername(name))[1]::uuid))
);

create policy "map_images_select"
on storage.objects for select
to public
using (
  bucket_id = 'map-images'
  and (is_public_access_enabled() or user_owns_project((storage.foldername(name))[1]::uuid))
);
