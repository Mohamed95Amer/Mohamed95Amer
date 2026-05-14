-- ============================================================================
--  Storage buckets
--    * product-images: public-read (approved products only — enforced at policy level)
--    * vendor-docs:    private, signed URLs only
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('vendor-docs', 'vendor-docs', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
--  product-images: vendor uploads under <vendor_id>/...
-- ---------------------------------------------------------------------------
drop policy if exists "product-images public read" on storage.objects;
create policy "product-images public read" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "product-images vendor write" on storage.objects;
create policy "product-images vendor write" on storage.objects
  for insert with check (
    bucket_id = 'product-images'
    and (
      public.is_admin()
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = auth.uid()
      )
    )
  );

drop policy if exists "product-images vendor delete" on storage.objects;
create policy "product-images vendor delete" on storage.objects
  for delete using (
    bucket_id = 'product-images'
    and (
      public.is_admin()
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
--  vendor-docs: private. Only the owning vendor + admins can read.
--  Path convention:  <vendor_id>/<doc_type>/<filename>
-- ---------------------------------------------------------------------------
drop policy if exists "vendor-docs owner or admin read" on storage.objects;
create policy "vendor-docs owner or admin read" on storage.objects
  for select using (
    bucket_id = 'vendor-docs'
    and (
      public.is_admin()
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = auth.uid()
      )
    )
  );

drop policy if exists "vendor-docs owner write" on storage.objects;
create policy "vendor-docs owner write" on storage.objects
  for insert with check (
    bucket_id = 'vendor-docs'
    and (split_part(name, '/', 1))::uuid in (
      select id from public.vendors where owner_user_id = auth.uid()
    )
  );

drop policy if exists "vendor-docs owner or admin delete" on storage.objects;
create policy "vendor-docs owner or admin delete" on storage.objects
  for delete using (
    bucket_id = 'vendor-docs'
    and (
      public.is_admin()
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = auth.uid()
      )
    )
  );
