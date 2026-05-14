-- ============================================================================
--  GoldHub — initial schema
--  All official money values live in AED. Gold weights are in grams.
--  All "official" prices are computed server-side; the frontend only mirrors.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
--  Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('customer', 'vendor', 'admin', 'super_admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type verification_status as enum ('pending', 'approved', 'rejected', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type product_status as enum ('draft','pending_approval','approved','rejected','suspended','sold_out');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reservation_status as enum (
    'pending_vendor_confirmation',
    'payment_link_pending',
    'payment_pending',
    'paid',
    'cancelled',
    'expired',
    'refunded',
    'rejected_by_vendor'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tick_status as enum ('ok','degraded','failed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
--  Profiles (mirrors auth.users) + role
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  role user_role not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'customer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper: lookup current role from JWT
create or replace function public.current_role()
returns user_role
language sql
stable
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()),
    'customer'::user_role
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select public.current_role() in ('admin','super_admin');
$$;

-- ---------------------------------------------------------------------------
--  Vendors
-- ---------------------------------------------------------------------------
create table if not exists public.vendors (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references public.profiles(id) on delete cascade,
  business_name text not null,
  trade_license_number text not null,
  license_expiry_date date not null,
  owner_name text not null,
  email text not null,
  phone text not null,
  emirate text not null check (emirate in (
    'Abu Dhabi','Dubai','Sharjah','Ajman','Umm Al Quwain','Ras Al Khaimah','Fujairah'
  )),
  store_address text not null,
  google_maps_link text,
  vat_trn_number text,
  bank_account_details jsonb,
  verification_status verification_status not null default 'pending',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id)
);

create index if not exists vendors_status_idx on public.vendors (verification_status);

-- Vendor documents (private storage references)
create table if not exists public.vendor_documents (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  doc_type text not null check (doc_type in (
    'trade_license','emirates_id','passport','vat_certificate','store_photo','authorization_letter'
  )),
  storage_path text not null,           -- path inside the private `vendor-docs` bucket
  original_filename text,
  mime_type text,
  size_bytes integer,
  uploaded_at timestamptz not null default now()
);

create index if not exists vendor_documents_vendor_idx on public.vendor_documents (vendor_id);

-- ---------------------------------------------------------------------------
--  Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  name text not null,
  description text,
  category text not null check (category in (
    'ring','necklace','bracelet','earring','bangle','chain','pendant','bar','coin','other'
  )),
  karat smallint not null check (karat in (18,21,22,24)),
  weight_grams numeric(12,3) not null check (weight_grams > 0),
  making_charge numeric(12,2) not null default 0 check (making_charge >= 0),
  stone_value numeric(12,2) not null default 0 check (stone_value >= 0),
  vendor_premium numeric(12,2) not null default 0 check (vendor_premium >= 0),
  quantity integer not null default 1 check (quantity >= 0),
  images jsonb not null default '[]'::jsonb,    -- array of public storage paths
  certificate_number text,
  hallmark_info text,
  product_status product_status not null default 'draft',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_vendor_idx on public.products (vendor_id);
create index if not exists products_status_idx on public.products (product_status);
create index if not exists products_karat_idx on public.products (karat);

-- ---------------------------------------------------------------------------
--  Gold price ticks (THE source of truth for live price)
-- ---------------------------------------------------------------------------
create table if not exists public.gold_price_ticks (
  id bigserial primary key,
  source text not null,
  xau_usd numeric(14,4),                          -- USD per troy ounce
  usd_aed numeric(10,6) not null,                 -- FX rate used
  price_per_gram_24k_aed numeric(14,4),           -- canonical: AED per gram, 24K
  fetched_at timestamptz not null default now(),
  status tick_status not null default 'ok',
  error_message text
);

create index if not exists gold_price_ticks_fetched_idx
  on public.gold_price_ticks (fetched_at desc);

create index if not exists gold_price_ticks_status_idx
  on public.gold_price_ticks (status, fetched_at desc);

-- Convenience view: the latest successful tick
create or replace view public.gold_price_latest as
  select *
  from public.gold_price_ticks
  where status = 'ok'
    and price_per_gram_24k_aed is not null
  order by fetched_at desc
  limit 1;

-- ---------------------------------------------------------------------------
--  Platform settings (admin-controlled)
-- ---------------------------------------------------------------------------
create table if not exists public.platform_settings (
  id boolean primary key default true check (id),  -- singleton row
  platform_fee_aed numeric(12,2) not null default 0 check (platform_fee_aed >= 0),
  delivery_fee_aed numeric(12,2) not null default 0 check (delivery_fee_aed >= 0),
  reservation_lock_minutes integer not null default 10 check (reservation_lock_minutes between 1 and 60),
  stale_price_seconds integer not null default 60 check (stale_price_seconds between 15 and 600),
  updated_at timestamptz not null default now()
);

insert into public.platform_settings (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
--  Reservations + price snapshots
-- ---------------------------------------------------------------------------
create table if not exists public.reservations (
  id uuid primary key default uuid_generate_v4(),
  customer_user_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  status reservation_status not null default 'pending_vendor_confirmation',
  quantity integer not null default 1 check (quantity >= 1),
  expires_at timestamptz not null,
  vendor_response_note text,
  payment_link text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_customer_idx on public.reservations (customer_user_id);
create index if not exists reservations_vendor_idx on public.reservations (vendor_id);
create index if not exists reservations_status_idx on public.reservations (status, expires_at);

create table if not exists public.order_price_snapshots (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  gold_tick_id bigint not null references public.gold_price_ticks(id) on delete restrict,

  -- exact inputs used to compute the official price
  gold_price_per_gram_24k_aed numeric(14,4) not null,
  karat smallint not null,
  karat_purity_factor numeric(6,4) not null,
  weight_grams numeric(12,3) not null,
  making_charge numeric(12,2) not null,
  stone_value numeric(12,2) not null,
  vendor_premium numeric(12,2) not null,
  platform_fee numeric(12,2) not null,
  delivery_fee numeric(12,2) not null,
  quantity integer not null,

  -- computed components
  gold_value_aed numeric(14,2) not null,
  unit_price_aed numeric(14,2) not null,
  total_price_aed numeric(14,2) not null,

  gold_price_fetched_at timestamptz not null,
  computed_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
--  Audit logs
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role user_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
--  updated_at triggers
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$ begin
  perform 1 from pg_trigger where tgname = 'touch_profiles';
  if not found then
    create trigger touch_profiles before update on public.profiles
      for each row execute function public.touch_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'touch_vendors';
  if not found then
    create trigger touch_vendors before update on public.vendors
      for each row execute function public.touch_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'touch_products';
  if not found then
    create trigger touch_products before update on public.products
      for each row execute function public.touch_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'touch_reservations';
  if not found then
    create trigger touch_reservations before update on public.reservations
      for each row execute function public.touch_updated_at();
  end if;
  perform 1 from pg_trigger where tgname = 'touch_platform_settings';
  if not found then
    create trigger touch_platform_settings before update on public.platform_settings
      for each row execute function public.touch_updated_at();
  end if;
end $$;
