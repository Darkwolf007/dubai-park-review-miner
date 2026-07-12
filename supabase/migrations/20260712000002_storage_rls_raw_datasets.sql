-- Step 17d fix: Storage buckets (Step 13) predate the Step 16 public-access-boolean pivot, so
-- raw-datasets had no working INSERT/SELECT/DELETE policy for the anonymous public-access path.
-- Discovered live: uploading as anon failed RLS even with app_settings.public_access_enabled=true.

create policy "raw_datasets_insert"
on storage.objects for insert
to public
with check (
  bucket_id = 'raw-datasets'
  and (
    is_public_access_enabled()
    or user_owns_project((storage.foldername(name))[1]::uuid)
  )
);

create policy "raw_datasets_select"
on storage.objects for select
to public
using (
  bucket_id = 'raw-datasets'
  and (
    is_public_access_enabled()
    or user_owns_project((storage.foldername(name))[1]::uuid)
  )
);

create policy "raw_datasets_delete"
on storage.objects for delete
to public
using (
  bucket_id = 'raw-datasets'
  and (
    is_public_access_enabled()
    or user_owns_project((storage.foldername(name))[1]::uuid)
  )
);
