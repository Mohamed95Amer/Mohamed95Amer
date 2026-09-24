begin;
select plan(12);

select is(
  (select file_size_limit from storage.buckets where id = 'product-images'),
  5242880::bigint,
  'product images are limited to 5 MB'
);
select ok(
  (select allowed_mime_types @> array['image/jpeg','image/png','image/webp','image/avif'] from storage.buckets where id = 'product-images'),
  'product image MIME types are restricted'
);
select is(
  (select file_size_limit from storage.buckets where id = 'vendor-docs'),
  10485760::bigint,
  'vendor documents are limited to 10 MB'
);
select ok(
  (select allowed_mime_types @> array['application/pdf','image/jpeg','image/png'] from storage.buckets where id = 'vendor-docs'),
  'vendor document MIME types are restricted'
);

select is(
  (select roles::text from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles self read'),
  '{authenticated}',
  'profile read policy is authenticated-only'
);
select is(
  (select roles::text from pg_policies where schemaname='public' and tablename='reservations' and policyname='reservations owner or vendor or admin read'),
  '{authenticated}',
  'reservation read policy is authenticated-only'
);
select is(
  (select roles::text from pg_policies where schemaname='public' and tablename='vendor_documents' and policyname='vendor_documents owner or admin read'),
  '{authenticated}',
  'vendor document row policy is authenticated-only'
);
select is(
  (select roles::text from pg_policies where schemaname='storage' and tablename='objects' and policyname='vendor-docs owner or admin read'),
  '{authenticated}',
  'private vendor file policy is authenticated-only'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anonymous users have no profile table access'
);
select ok(
  not has_table_privilege('anon', 'public.reservations', 'SELECT'),
  'anonymous users have no reservation table access'
);
select ok(
  not has_function_privilege('authenticated', 'public.touch_updated_at()', 'EXECUTE'),
  'authenticated users cannot call the trigger helper'
);
select ok(
  not has_function_privilege('anon', 'public.touch_updated_at()', 'EXECUTE'),
  'anonymous users cannot call the trigger helper'
);

select * from finish();
rollback;
