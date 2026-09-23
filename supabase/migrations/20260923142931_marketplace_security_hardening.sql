-- Security hardening for public signup, browser grants, RLS and vendor uploads.
-- All marketplace mutations continue through authenticated server routes.

-- raw_user_meta_data is controlled by the person signing up. It may carry
-- attribution/profile input but must never grant an authorization role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_referrer uuid;
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    'customer'::public.user_role
  ) on conflict (id) do nothing;

  if v_code <> '' then
    select user_id into v_referrer
    from public.referral_codes
    where code = v_code;

    if v_referrer is not null and v_referrer <> new.id then
      insert into public.referral_attributions (
        referred_user_id, referrer_user_id, referral_code
      ) values (new.id, v_referrer, v_code)
      on conflict (referred_user_id) do nothing;
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Limit direct Data API access to the minimum still needed by authenticated
-- profile reads. Sensitive marketplace rows remain ownership-scoped by RLS.
revoke all privileges on table public.profiles from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.profiles from authenticated;
grant select on table public.profiles to authenticated;

revoke all privileges on table
  public.reservations,
  public.vendor_documents,
  public.order_price_snapshots,
  public.audit_logs
from anon;
grant select on table
  public.reservations,
  public.vendor_documents,
  public.order_price_snapshots,
  public.audit_logs
to authenticated;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles admin insert" on public.profiles;

drop policy if exists "reservations owner or vendor or admin read" on public.reservations;
create policy "reservations owner or vendor or admin read" on public.reservations
  for select to authenticated
  using (
    customer_user_id = (select auth.uid())
    or vendor_id in (
      select id from public.vendors where owner_user_id = (select auth.uid())
    )
    or (select public.is_admin())
  );

drop policy if exists "vendor_documents owner or admin read" on public.vendor_documents;
create policy "vendor_documents owner or admin read" on public.vendor_documents
  for select to authenticated
  using (
    (select public.is_admin())
    or vendor_id in (
      select id from public.vendors where owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "order_price_snapshots scoped read" on public.order_price_snapshots;
create policy "order_price_snapshots scoped read" on public.order_price_snapshots
  for select to authenticated
  using (
    (select public.is_admin())
    or reservation_id in (
      select id from public.reservations
      where customer_user_id = (select auth.uid())
         or vendor_id in (
           select id from public.vendors where owner_user_id = (select auth.uid())
         )
    )
  );

drop policy if exists "audit_logs admin read" on public.audit_logs;
create policy "audit_logs admin read" on public.audit_logs
  for select to authenticated
  using ((select public.is_admin()));

-- A trigger helper has no reason to be directly callable over PostgREST.
revoke all on function public.touch_updated_at() from public, anon, authenticated;

-- Server-side validation is the first boundary; bucket enforcement prevents a
-- modified browser client from uploading arbitrary or oversized files.
update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id = 'product-images';

update storage.buckets
set file_size_limit = 10485760,
    allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png']
where id = 'vendor-docs';

drop policy if exists "product-images vendor write" on storage.objects;
create policy "product-images vendor write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (
      (select public.is_admin())
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "product-images vendor update" on storage.objects;
create policy "product-images vendor update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (
      (select public.is_admin())
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = (select auth.uid())
      )
    )
  )
  with check (
    bucket_id = 'product-images'
    and (
      (select public.is_admin())
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "product-images vendor delete" on storage.objects;
create policy "product-images vendor delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (
      (select public.is_admin())
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "vendor-docs owner or admin read" on storage.objects;
create policy "vendor-docs owner or admin read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'vendor-docs'
    and (
      (select public.is_admin())
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = (select auth.uid())
      )
    )
  );

drop policy if exists "vendor-docs owner write" on storage.objects;
create policy "vendor-docs owner write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'vendor-docs'
    and (split_part(name, '/', 1))::uuid in (
      select id from public.vendors where owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "vendor-docs owner update" on storage.objects;
create policy "vendor-docs owner update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vendor-docs'
    and (split_part(name, '/', 1))::uuid in (
      select id from public.vendors where owner_user_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'vendor-docs'
    and (split_part(name, '/', 1))::uuid in (
      select id from public.vendors where owner_user_id = (select auth.uid())
    )
  );

drop policy if exists "vendor-docs owner or admin delete" on storage.objects;
create policy "vendor-docs owner or admin delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'vendor-docs'
    and (
      (select public.is_admin())
      or (split_part(name, '/', 1))::uuid in (
        select id from public.vendors where owner_user_id = (select auth.uid())
      )
    )
  );

notify pgrst, 'reload schema';
