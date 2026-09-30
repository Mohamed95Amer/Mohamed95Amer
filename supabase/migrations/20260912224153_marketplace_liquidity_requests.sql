-- Marketplace-liquidity release: strict catalogue integrity, inventory
-- freshness, buyer demand requests, managed onboarding, store-visit leads and
-- a provider-ready (but disabled by default) online-payment choice.

alter table public.platform_settings
  add column if not exists listing_fresh_days integer not null default 45
    check (listing_fresh_days between 7 and 180),
  add column if not exists online_payments_enabled boolean not null default false,
  add column if not exists online_payment_provider text;

comment on column public.platform_settings.listing_fresh_days is
  'Approved listings older than this inventory-confirmation window are hidden from public discovery.';
comment on column public.platform_settings.online_payments_enabled is
  'Fail-closed feature flag. Enable only after a contracted PSP checkout implementation is deployed.';

alter table public.products
  add column if not exists inventory_confirmed_at timestamptz not null default now(),
  add column if not exists managed_by_get_gold boolean not null default false,
  add column if not exists data_quality_status text not null default 'unchecked'
    check (data_quality_status in ('unchecked', 'valid', 'blocked')),
  add column if not exists data_quality_issues jsonb not null default '[]'::jsonb,
  add column if not exists last_quality_checked_at timestamptz;

create index if not exists products_public_freshness_idx
  on public.products (product_status, inventory_confirmed_at desc);

create or replace function public.product_integrity_issues(
  p_name text,
  p_description text,
  p_category text,
  p_karat integer,
  p_weight_grams numeric,
  p_quantity integer,
  p_making_charge numeric,
  p_making_discount integer,
  p_certificate_fee numeric,
  p_certificate_number text,
  p_hallmark_info text,
  p_images jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_issues jsonb := '[]'::jsonb;
  v_mentioned integer;
begin
  if nullif(btrim(p_name), '') is null or length(btrim(p_name)) < 4 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'NAME_TOO_SHORT', 'message', 'Use a specific product title.'));
  end if;

  foreach v_mentioned in array array[18, 21, 22, 24]
  loop
    if coalesce(p_name, '') ~* ('(^|[^0-9])' || v_mentioned || '\s*[kK]([^0-9]|$)')
      and v_mentioned <> p_karat then
      v_issues := v_issues || jsonb_build_array(jsonb_build_object(
        'code', 'KARAT_TITLE_MISMATCH',
        'message', format('The title says %sK but the structured purity is %sK.', v_mentioned, p_karat)
      ));
    end if;
  end loop;

  if p_category = 'bar' and coalesce(p_name, '') !~* '\m(bar|ingot|bullion)\M' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'CATEGORY_TITLE_MISMATCH', 'message', 'A bar listing title must identify the item as a bar, ingot or bullion.'));
  elsif p_category = 'coin' and coalesce(p_name, '') !~* '\mcoin\M' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'CATEGORY_TITLE_MISMATCH', 'message', 'A coin listing title must identify the item as a coin.'));
  elsif p_category <> 'bar' and coalesce(p_name, '') ~* '\m(gold bar|ingot)\M' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'CATEGORY_TITLE_MISMATCH', 'message', 'The title describes bullion but the selected category is not Bar.'));
  end if;

  if p_weight_grams is null or p_weight_grams <= 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'INVALID_WEIGHT', 'message', 'Enter a positive net gold weight.'));
  end if;
  if p_quantity is null or p_quantity <= 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'NO_SELLABLE_STOCK', 'message', 'Confirm at least one sellable unit before submission.'));
  end if;
  if p_making_discount > 0 and p_making_charge <= 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'INVALID_MAKING_DISCOUNT', 'message', 'A making-charge discount requires an original making charge.'));
  end if;
  if p_certificate_fee > 0 and nullif(btrim(p_certificate_number), '') is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'CERTIFICATE_REFERENCE_REQUIRED', 'message', 'A certificate fee requires a certificate or assay reference.'));
  end if;
  if p_category in ('bar', 'coin')
    and nullif(btrim(p_certificate_number), '') is null
    and nullif(btrim(p_hallmark_info), '') is null then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'BULLION_EVIDENCE_REQUIRED', 'message', 'Bullion requires a certificate/assay reference or hallmark details.'));
  end if;
  if length(btrim(coalesce(p_description, ''))) < 20 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'DESCRIPTION_REQUIRED', 'message', 'Add a description of at least 20 characters.'));
  end if;
  if jsonb_typeof(coalesce(p_images, '[]'::jsonb)) <> 'array' then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'PHOTO_REQUIRED', 'message', 'Add at least one product photograph.'));
  elsif jsonb_array_length(coalesce(p_images, '[]'::jsonb)) = 0 then
    v_issues := v_issues || jsonb_build_array(jsonb_build_object('code', 'PHOTO_REQUIRED', 'message', 'Add at least one product photograph.'));
  end if;

  return v_issues;
end
$$;

revoke all on function public.product_integrity_issues(text, text, text, integer, numeric, integer, numeric, integer, numeric, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.product_integrity_issues(text, text, text, integer, numeric, integer, numeric, integer, numeric, text, text, jsonb)
  to service_role;

create or replace function public.check_product_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_quality_issues := public.product_integrity_issues(
    new.name,
    new.description,
    new.category::text,
    new.karat,
    new.weight_grams,
    new.quantity,
    new.making_charge,
    new.making_charge_discount_percent,
    new.certificate_fee,
    new.certificate_number,
    new.hallmark_info,
    new.images
  );
  new.data_quality_status := case when new.data_quality_issues = '[]'::jsonb then 'valid' else 'blocked' end;
  new.last_quality_checked_at := now();

  if new.product_status in ('pending_approval', 'approved') and new.data_quality_status = 'blocked' then
    raise exception 'product_integrity_failed' using detail = new.data_quality_issues::text;
  end if;
  return new;
end
$$;

revoke all on function public.check_product_integrity() from public, anon, authenticated;

drop trigger if exists check_product_integrity on public.products;
create trigger check_product_integrity
before insert or update of name, description, category, karat, weight_grams, quantity,
  making_charge, making_charge_discount_percent, certificate_fee, certificate_number,
  hallmark_info, images, product_status
on public.products
for each row execute function public.check_product_integrity();

-- Recalculate quality metadata for existing listings without blocking the
-- migration. Admins see legacy problems immediately; the next approval or
-- product edit must resolve them.
update public.products
set data_quality_issues = public.product_integrity_issues(
      name, description, category::text, karat, weight_grams, quantity,
      making_charge, making_charge_discount_percent, certificate_fee,
      certificate_number, hallmark_info, images
    ),
    data_quality_status = case
      when public.product_integrity_issues(
        name, description, category::text, karat, weight_grams, quantity,
        making_charge, making_charge_discount_percent, certificate_fee,
        certificate_number, hallmark_info, images
      ) = '[]'::jsonb then 'valid' else 'blocked' end,
    last_quality_checked_at = now();

-- NOT VALID preserves legacy rows that need admin correction while enforcing
-- the rules on every subsequent insert or update. Add these only after the
-- metadata backfill above, otherwise Postgres would re-check legacy rows during
-- that update and could abort the migration.
alter table public.products
  drop constraint if exists products_certificate_fee_requires_reference,
  add constraint products_certificate_fee_requires_reference check (
    product_status not in ('pending_approval', 'approved')
    or certificate_fee = 0
    or nullif(btrim(certificate_number), '') is not null
  ) not valid,
  drop constraint if exists products_making_discount_requires_charge,
  add constraint products_making_discount_requires_charge check (
    product_status not in ('pending_approval', 'approved')
    or making_charge_discount_percent = 0
    or making_charge > 0
  ) not valid;

alter table public.reservations
  add column if not exists payment_method text not null default 'pay_at_store'
    check (payment_method in ('pay_at_store', 'pay_online')),
  add column if not exists payment_status text not null default 'not_required'
    check (payment_status in ('not_required', 'awaiting_store_confirmation', 'awaiting_checkout', 'processing', 'paid', 'failed', 'refunded')),
  add column if not exists payment_provider text,
  add column if not exists provider_payment_id text;

comment on column public.reservations.payment_method is
  'Customer preference captured at order creation. pay_online is accepted only while the server-side platform flag is enabled.';

create table if not exists public.buyer_requests (
  id uuid primary key default uuid_generate_v4(),
  customer_user_id uuid not null references public.profiles(id) on delete restrict,
  category text not null check (category in ('ring','necklace','bracelet','earring','bangle','chain','pendant','bar','coin','other')),
  karat smallint not null check (karat in (18,21,22,24)),
  budget_min_aed numeric(12,2) not null check (budget_min_aed >= 0),
  budget_max_aed numeric(12,2) not null check (budget_max_aed >= budget_min_aed),
  emirate text not null,
  needed_by date,
  description text not null check (length(btrim(description)) between 20 and 2000),
  reference_image_path text,
  status text not null default 'open' check (status in ('open','matched','closed','cancelled')),
  selected_offer_id uuid,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyer_request_offers (
  id uuid primary key default uuid_generate_v4(),
  buyer_request_id uuid not null references public.buyer_requests(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  total_price_aed numeric(12,2) not null check (total_price_aed > 0),
  making_charge_aed numeric(12,2) not null default 0 check (making_charge_aed >= 0),
  certificate_fee_aed numeric(12,2) not null default 0 check (certificate_fee_aed >= 0),
  estimated_days integer not null check (estimated_days between 1 and 180),
  supports_delivery boolean not null default true,
  note text check (note is null or length(btrim(note)) between 10 and 1000),
  status text not null default 'submitted' check (status in ('submitted','accepted','declined','withdrawn','expired')),
  valid_until timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_request_id, vendor_id)
);

alter table public.buyer_requests
  drop constraint if exists buyer_requests_selected_offer_id_fkey,
  add constraint buyer_requests_selected_offer_id_fkey
    foreign key (selected_offer_id) references public.buyer_request_offers(id) on delete set null;

create index if not exists buyer_requests_open_idx on public.buyer_requests (status, expires_at, created_at desc);
create index if not exists buyer_requests_customer_idx on public.buyer_requests (customer_user_id, created_at desc);
create index if not exists buyer_requests_selected_offer_idx on public.buyer_requests (selected_offer_id)
  where selected_offer_id is not null;
create index if not exists buyer_request_offers_vendor_idx on public.buyer_request_offers (vendor_id, created_at desc);
create index if not exists buyer_request_offers_created_vendor_idx on public.buyer_request_offers (created_at desc, vendor_id);

create table if not exists public.store_visit_requests (
  id uuid primary key default uuid_generate_v4(),
  customer_user_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  preferred_at timestamptz not null,
  phone text not null check (length(btrim(phone)) between 7 and 20),
  note text check (note is null or length(btrim(note)) <= 500),
  status text not null default 'requested' check (status in ('requested','confirmed','completed','declined','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists store_visit_requests_vendor_idx on public.store_visit_requests (vendor_id, status, preferred_at);
create index if not exists store_visit_requests_customer_idx on public.store_visit_requests (customer_user_id, created_at desc);
create index if not exists store_visit_requests_product_idx on public.store_visit_requests (product_id);
create index if not exists store_visit_requests_created_vendor_idx on public.store_visit_requests (created_at desc, vendor_id);

create index if not exists reservations_created_vendor_idx on public.reservations (created_at desc, vendor_id);

create table if not exists public.catalogue_support_requests (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  requested_by uuid not null references public.profiles(id) on delete restrict,
  target_listing_count integer not null default 15 check (target_listing_count between 10 and 20),
  notes text check (notes is null or length(btrim(notes)) <= 1000),
  status text not null default 'requested' check (status in ('requested','scheduled','in_progress','completed','cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists catalogue_support_one_active_idx
  on public.catalogue_support_requests (vendor_id)
  where status in ('requested','scheduled','in_progress');
create index if not exists catalogue_support_vendor_idx on public.catalogue_support_requests (vendor_id);
create index if not exists catalogue_support_requested_by_idx on public.catalogue_support_requests (requested_by);
create index if not exists catalogue_support_assigned_to_idx on public.catalogue_support_requests (assigned_to)
  where assigned_to is not null;

alter table public.buyer_requests enable row level security;
alter table public.buyer_request_offers enable row level security;
alter table public.store_visit_requests enable row level security;
alter table public.catalogue_support_requests enable row level security;

revoke all on table public.buyer_requests, public.buyer_request_offers,
  public.store_visit_requests, public.catalogue_support_requests from anon, authenticated;
grant select, insert, update on table public.buyer_requests, public.buyer_request_offers,
  public.store_visit_requests, public.catalogue_support_requests to service_role;

drop trigger if exists touch_buyer_requests on public.buyer_requests;
create trigger touch_buyer_requests before update on public.buyer_requests
for each row execute function public.touch_updated_at();
drop trigger if exists touch_buyer_request_offers on public.buyer_request_offers;
create trigger touch_buyer_request_offers before update on public.buyer_request_offers
for each row execute function public.touch_updated_at();
drop trigger if exists touch_store_visit_requests on public.store_visit_requests;
create trigger touch_store_visit_requests before update on public.store_visit_requests
for each row execute function public.touch_updated_at();
drop trigger if exists touch_catalogue_support_requests on public.catalogue_support_requests;
create trigger touch_catalogue_support_requests before update on public.catalogue_support_requests
for each row execute function public.touch_updated_at();

create or replace function public.accept_buyer_request_offer(
  p_customer_user_id uuid,
  p_offer_id uuid
)
returns setof public.buyer_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offer public.buyer_request_offers;
  v_request public.buyer_requests;
begin
  select * into v_offer from public.buyer_request_offers where id = p_offer_id for update;
  if not found or v_offer.status <> 'submitted' or v_offer.valid_until <= now() then
    raise exception 'offer_not_available';
  end if;

  select * into v_request from public.buyer_requests where id = v_offer.buyer_request_id for update;
  if not found or v_request.customer_user_id <> p_customer_user_id then
    raise exception 'request_not_found';
  end if;
  if v_request.status <> 'open' or v_request.expires_at <= now() then
    raise exception 'request_not_open';
  end if;

  update public.buyer_request_offers
  set status = case when id = v_offer.id then 'accepted' else 'declined' end
  where buyer_request_id = v_request.id and status = 'submitted';

  update public.buyer_requests
  set status = 'matched', selected_offer_id = v_offer.id
  where id = v_request.id
  returning * into v_request;

  return next v_request;
  return;
end
$$;

revoke all on function public.accept_buyer_request_offer(uuid, uuid) from public, anon, authenticated;
grant execute on function public.accept_buyer_request_offer(uuid, uuid) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'buyer-request-images',
  'buyer-request-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace view public.vendor_liquidity_summary
with (security_invoker = true)
as
with product_stats as (
  select
    p.vendor_id,
    count(*) filter (where p.product_status = 'approved') as approved_listings,
    count(*) filter (
      where p.product_status = 'approved'
        and p.quantity > 0
        and p.data_quality_status = 'valid'
        and p.inventory_confirmed_at >= now() - make_interval(days => s.listing_fresh_days)
    ) as live_listings,
    max(p.inventory_confirmed_at) as last_inventory_confirmation
  from public.products p
  cross join public.platform_settings s
  where s.id = true
  group by p.vendor_id, s.listing_fresh_days
), reservation_stats as (
  select vendor_id, count(*) as reservations_30d
  from public.reservations
  where created_at >= now() - interval '30 days'
  group by vendor_id
), offer_stats as (
  select vendor_id, count(*) as request_offers_30d
  from public.buyer_request_offers
  where created_at >= now() - interval '30 days'
  group by vendor_id
), visit_stats as (
  select vendor_id, count(*) as visit_requests_30d
  from public.store_visit_requests
  where created_at >= now() - interval '30 days'
  group by vendor_id
)
select
  v.id as vendor_id,
  coalesce(p.approved_listings, 0) as approved_listings,
  coalesce(p.live_listings, 0) as live_listings,
  coalesce(r.reservations_30d, 0) as reservations_30d,
  coalesce(o.request_offers_30d, 0) as request_offers_30d,
  coalesce(sv.visit_requests_30d, 0) as visit_requests_30d,
  p.last_inventory_confirmation
from public.vendors v
left join product_stats p on p.vendor_id = v.id
left join reservation_stats r on r.vendor_id = v.id
left join offer_stats o on o.vendor_id = v.id
left join visit_stats sv on sv.vendor_id = v.id;

revoke all on table public.vendor_liquidity_summary from anon, authenticated;
grant select on table public.vendor_liquidity_summary to service_role;

notify pgrst, 'reload schema';
