-- Store location is captured as an optional precise pin during vendor onboarding.
-- The address remains the human-readable fallback; coordinates power map links
-- and make store discovery reliable on mobile.
alter table public.vendors
  add column if not exists store_latitude numeric(9,6),
  add column if not exists store_longitude numeric(9,6);

alter table public.vendors
  drop constraint if exists vendors_store_coordinates_check;

alter table public.vendors
  add constraint vendors_store_coordinates_check check (
    (store_latitude is null) = (store_longitude is null)
    and (store_latitude is null or (store_latitude between -90 and 90 and store_longitude between -180 and 180))
  );

comment on column public.vendors.store_latitude is 'Optional exact store pin latitude captured during onboarding.';
comment on column public.vendors.store_longitude is 'Optional exact store pin longitude captured during onboarding.';
