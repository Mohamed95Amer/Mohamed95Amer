-- Growth and fulfilment release: first-party notifications, favourites and
-- price alerts, comparison support, referral attribution, privacy-minimal
-- funnel events, linked buyer-request offers and courier assignments.

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'en' check (language in ('en', 'ar')),
  in_app_notifications boolean not null default true,
  email_notifications boolean not null default true,
  sms_notifications boolean not null default false,
  whatsapp_notifications boolean not null default false,
  marketing_notifications boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in (
    'order', 'offer', 'price_alert', 'delivery', 'inventory', 'account', 'system'
  )),
  title text not null check (char_length(title) between 2 and 160),
  body text not null check (char_length(body) between 2 and 600),
  href text check (href is null or (href like '/%' and href not like '//%')),
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;

create table if not exists public.product_favourites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

create index if not exists product_favourites_product_idx
  on public.product_favourites (product_id);

alter table public.products
  add column if not exists search_document tsvector generated always as (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(description, '') || ' ' ||
      coalesce(category, '') || ' ' || coalesce(certificate_number, '') || ' ' ||
      coalesce(hallmark_info, '')
    )
  ) stored;

create index if not exists products_search_document_idx
  on public.products using gin (search_document);

create table if not exists public.price_alerts (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  target_total_aed numeric(14,2) check (target_total_aed is null or target_total_aed > 0),
  notify_on_making_offer boolean not null default true,
  active boolean not null default true,
  last_evaluated_at timestamptz,
  last_triggered_at timestamptz,
  last_triggered_total_aed numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id),
  check (target_total_aed is not null or notify_on_making_offer)
);

create index if not exists price_alerts_active_idx
  on public.price_alerts (product_id, id) where active;

alter table public.buyer_request_offers
  add column if not exists product_id uuid references public.products(id) on delete set null;

create index if not exists buyer_request_offers_product_idx
  on public.buyer_request_offers (product_id) where product_id is not null;

create table if not exists public.delivery_assignments (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  delivery_company_id uuid not null references public.delivery_companies(id) on delete restrict,
  assigned_by_user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'offered' check (status in (
    'offered', 'accepted', 'pickup_scheduled', 'collected', 'out_for_delivery',
    'delivered', 'declined', 'cancelled', 'delivery_failed'
  )),
  tracking_code text not null unique default (
    'GG-' || upper(substr(replace(uuid_generate_v4()::text, '-', ''), 1, 10))
  ),
  public_note text check (public_note is null or char_length(public_note) <= 500),
  proof_reference text check (proof_reference is null or char_length(proof_reference) <= 500),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists delivery_assignments_company_status_idx
  on public.delivery_assignments (delivery_company_id, status, created_at desc);
create index if not exists delivery_assignments_assigned_by_idx
  on public.delivery_assignments (assigned_by_user_id);

create table if not exists public.marketplace_events (
  id bigserial primary key,
  event_name text not null check (event_name in (
    'marketplace_view', 'search', 'product_view', 'favourite_added',
    'compare_added', 'alert_created', 'identity_started', 'reservation_created',
    'offer_accepted', 'delivery_assigned', 'referral_shared',
    'buyer_request_created', 'store_visit_requested'
  )),
  user_id uuid references public.profiles(id) on delete set null,
  anonymous_session_id uuid,
  product_id uuid references public.products(id) on delete set null,
  vendor_id uuid references public.vendors(id) on delete set null,
  reservation_id uuid references public.reservations(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

create index if not exists marketplace_events_name_time_idx
  on public.marketplace_events (event_name, occurred_at desc);
create index if not exists marketplace_events_vendor_time_idx
  on public.marketplace_events (vendor_id, occurred_at desc) where vendor_id is not null;
create index if not exists marketplace_events_user_time_idx
  on public.marketplace_events (user_id, occurred_at desc) where user_id is not null;
create index if not exists marketplace_events_product_idx
  on public.marketplace_events (product_id) where product_id is not null;
create index if not exists marketplace_events_reservation_idx
  on public.marketplace_events (reservation_id) where reservation_id is not null;

create table if not exists public.referral_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8,16}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referral_attributions (
  referred_user_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_user_id uuid not null references public.profiles(id) on delete cascade,
  referral_code text not null references public.referral_codes(code) on delete restrict,
  first_purchase_at timestamptz,
  created_at timestamptz not null default now(),
  check (referred_user_id <> referrer_user_id)
);

create index if not exists referral_attributions_referrer_idx
  on public.referral_attributions (referrer_user_id, created_at desc);
create index if not exists referral_attributions_code_idx
  on public.referral_attributions (referral_code);

alter table public.user_preferences enable row level security;
alter table public.notifications enable row level security;
alter table public.product_favourites enable row level security;
alter table public.price_alerts enable row level security;
alter table public.delivery_assignments enable row level security;
alter table public.marketplace_events enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;

revoke all on table public.user_preferences, public.notifications,
  public.product_favourites, public.price_alerts, public.delivery_assignments,
  public.marketplace_events, public.referral_codes, public.referral_attributions
  from anon, authenticated;
grant select, insert, update on table public.user_preferences to service_role;
grant select, insert, update on table public.notifications to service_role;
grant select, insert, delete on table public.product_favourites to service_role;
grant select, insert, update on table public.price_alerts to service_role;
grant select, insert, update, delete on table public.delivery_assignments to service_role;
grant select, insert, delete on table public.marketplace_events to service_role;
grant select, insert on table public.referral_codes to service_role;
grant select, insert, update on table public.referral_attributions to service_role;
grant usage, select on sequence public.marketplace_events_id_seq to service_role;

drop trigger if exists touch_user_preferences on public.user_preferences;
create trigger touch_user_preferences before update on public.user_preferences
for each row execute function public.touch_updated_at();
drop trigger if exists touch_price_alerts on public.price_alerts;
create trigger touch_price_alerts before update on public.price_alerts
for each row execute function public.touch_updated_at();
drop trigger if exists touch_delivery_assignments on public.delivery_assignments;
create trigger touch_delivery_assignments before update on public.delivery_assignments
for each row execute function public.touch_updated_at();

-- This trigger validates a linked offer against the vendor's live catalogue.
-- A custom, unlisted offer may stay unlinked, but only a real approved listing
-- can send the buyer into the ordinary stock-locking checkout.
create or replace function public.validate_buyer_offer_product()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_product public.products;
begin
  if new.product_id is null then return new; end if;
  select * into v_product from public.products where id = new.product_id;
  if not found or v_product.vendor_id <> new.vendor_id
    or v_product.product_status <> 'approved'
    or v_product.quantity <= 0
    or v_product.data_quality_status <> 'valid'
    or v_product.inventory_confirmed_at < now() - make_interval(days => coalesce((
      select listing_fresh_days from public.platform_settings where id = true
    ), 45))
    or not exists (
      select 1 from public.vendors v
      where v.id = new.vendor_id
        and v.verification_status = 'approved'
        and v.license_expiry_date >= (now() at time zone 'Asia/Dubai')::date
    ) then
    raise exception 'offer_product_not_available';
  end if;
  return new;
end
$$;

revoke all on function public.validate_buyer_offer_product() from public, anon, authenticated;
drop trigger if exists validate_buyer_offer_product on public.buyer_request_offers;
create trigger validate_buyer_offer_product
before insert or update of product_id, vendor_id on public.buyer_request_offers
for each row execute function public.validate_buyer_offer_product();

-- Referral metadata is attribution input, never authorization input. The code
-- must already exist, cannot refer to the new user and can be consumed once.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.user_role;
  v_referrer uuid;
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data->>'referral_code', '')));
begin
  v_role := case lower(coalesce(new.raw_user_meta_data->>'role', ''))
    when 'vendor' then 'vendor'::public.user_role
    when 'delivery_company' then 'delivery_company'::public.user_role
    else 'customer'::public.user_role
  end;

  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    v_role
  ) on conflict (id) do nothing;

  if v_role = 'customer' and v_code <> '' then
    select user_id into v_referrer from public.referral_codes where code = v_code;
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

comment on table public.marketplace_events is
  'First-party, privacy-minimal conversion events. Never store free-text, identity documents, addresses or biometrics in metadata.';
comment on table public.delivery_assignments is
  'A delivery company receives order details only through an explicit server-authorized assignment.';
