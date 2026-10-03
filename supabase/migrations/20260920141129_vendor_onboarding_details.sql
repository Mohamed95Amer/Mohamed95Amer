-- Additional business and contact details collected during vendor onboarding.
-- Nullable contact fields preserve older applications that only supplied owner_name.
alter table public.vendors
  add column if not exists contact_first_name text,
  add column if not exists contact_last_name text,
  add column if not exists contact_title text,
  add column if not exists number_of_stores integer not null default 1,
  add column if not exists delivery_available boolean not null default false,
  add column if not exists online_payment_available boolean not null default false,
  add column if not exists website_available boolean not null default false,
  add column if not exists website_url text;

alter table public.vendors
  drop constraint if exists vendors_number_of_stores_check;

alter table public.vendors
  add constraint vendors_number_of_stores_check
  check (number_of_stores between 1 and 1000);

alter table public.vendors
  drop constraint if exists vendors_website_url_check;

alter table public.vendors
  add constraint vendors_website_url_check
  check (website_available = false or website_url is not null);

create index if not exists vendors_website_available_idx
  on public.vendors (website_available)
  where website_available = true;
