-- Keep seeded catalogue data available for testing while allowing the owner to
-- remove it from every public discovery surface before real vendors launch.
alter table public.platform_settings
  add column if not exists demo_data_visible boolean not null default true;

comment on column public.platform_settings.demo_data_visible is
  'When false, rows marked is_demo are excluded from public catalogue, vendor and price-history views.';

alter table public.vendors
  add column if not exists is_demo boolean not null default false;

alter table public.products
  add column if not exists is_demo boolean not null default false;

alter table public.reservations
  add column if not exists is_demo boolean not null default false;

alter table public.reviews
  add column if not exists is_demo boolean not null default false;

comment on column public.vendors.is_demo is 'Seeded/demo vendor row; never present publicly when demo_data_visible is false.';
comment on column public.products.is_demo is 'Seeded/demo listing row; never present publicly when demo_data_visible is false.';
comment on column public.reservations.is_demo is 'Reservation belonging to seeded/demo catalogue data.';
comment on column public.reviews.is_demo is 'Review belonging to seeded/demo catalogue data.';

create index if not exists vendors_public_demo_idx on public.vendors (is_demo, verification_status, business_name);
create index if not exists products_public_demo_idx on public.products (is_demo, product_status, created_at desc);
create index if not exists reservations_demo_idx on public.reservations (is_demo, created_at desc);

-- Production was deliberately populated with clearly identifiable demo owners
-- and placeholder example.ae contact addresses. The first five approved shops
-- are the seeded catalogue; the later Dinar Gold listing is a real onboarding.
update public.vendors
set is_demo = true
where is_demo = false
  and (
    id in (
      '0df10f79-87a1-42dc-a81e-107be9b5a0a2',
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      '44444444-4444-4444-4444-444444444444',
      '55555555-5555-5555-5555-555555555555'
    )
    or email ilike '%@example.ae'
    or business_name ilike '%demo%'
    or owner_name ilike '%demo%'
  );

update public.products p
set is_demo = true
from public.vendors v
where p.is_demo = false and p.vendor_id = v.id and v.is_demo;

update public.reservations r
set is_demo = true
where r.is_demo = false
  and (
    exists (select 1 from public.vendors v where v.id = r.vendor_id and v.is_demo)
    or exists (select 1 from public.products p where p.id = r.product_id and p.is_demo)
  );

update public.reviews rv
set is_demo = true
where rv.is_demo = false
  and (
    exists (select 1 from public.vendors v where v.id = rv.vendor_id and v.is_demo)
    or exists (select 1 from public.products p where p.id = rv.product_id and p.is_demo)
  );
