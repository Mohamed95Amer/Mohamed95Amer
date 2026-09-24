-- Admin-controlled merchandising and seasonal offers. All write paths stay
-- behind the service role and are exposed to operators through audited routes.

create table public.vendor_promotions (
  id uuid primary key default uuid_generate_v4(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  label text not null default 'Premium vendor' check (char_length(label) between 2 and 60),
  reward_reason text not null default 'referral_reward' check (reward_reason in (
    'referral_reward', 'launch_reward', 'performance_reward', 'commercial', 'other'
  )),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (cancelled_at is null or cancelled_by_user_id is not null)
);

create index vendor_promotions_active_idx
  on public.vendor_promotions (vendor_id, starts_at, ends_at)
  where cancelled_at is null;
create index vendor_promotions_vendor_history_idx
  on public.vendor_promotions (vendor_id, created_at desc);
create index vendor_promotions_created_by_idx on public.vendor_promotions (created_by_user_id);
create index vendor_promotions_cancelled_by_idx on public.vendor_promotions (cancelled_by_user_id)
  where cancelled_by_user_id is not null;

create table public.site_banners (
  id uuid primary key default uuid_generate_v4(),
  title text not null check (char_length(title) between 2 and 100),
  body text check (body is null or char_length(body) <= 280),
  image_path text check (image_path is null or char_length(image_path) <= 500),
  image_alt text check (image_alt is null or char_length(image_alt) <= 160),
  cta_label text check (cta_label is null or char_length(cta_label) between 2 and 40),
  cta_href text check (
    cta_href is null or char_length(cta_href) <= 500
    and (cta_href like '/%' and cta_href not like '//%' or cta_href like 'https://%')
  ),
  placement text not null check (placement in (
    'home_top', 'home_middle', 'marketplace_top', 'vendors_top'
  )),
  display_order smallint not null default 0 check (display_order between 0 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check (cancelled_at is null or cancelled_by_user_id is not null),
  check ((image_path is null) = (image_alt is null)),
  check ((cta_label is null) = (cta_href is null))
);

create index site_banners_active_idx
  on public.site_banners (placement, starts_at, ends_at, display_order)
  where cancelled_at is null;
create index site_banners_created_by_idx on public.site_banners (created_by_user_id);
create index site_banners_cancelled_by_idx on public.site_banners (cancelled_by_user_id)
  where cancelled_by_user_id is not null;

create table public.marketplace_promotions (
  id uuid primary key default uuid_generate_v4(),
  title text not null check (char_length(title) between 2 and 100),
  service_fee_discount_percent smallint not null default 0
    check (service_fee_discount_percent between 0 and 100),
  delivery_discount_percent smallint not null default 0
    check (delivery_discount_percent between 0 and 100),
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_by_user_id uuid not null references public.profiles(id) on delete restrict,
  cancelled_at timestamptz,
  cancelled_by_user_id uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (service_fee_discount_percent > 0 or delivery_discount_percent > 0),
  check (ends_at > starts_at),
  check (cancelled_at is null or cancelled_by_user_id is not null)
);

create index marketplace_promotions_active_idx
  on public.marketplace_promotions (starts_at, ends_at)
  where cancelled_at is null;
create index marketplace_promotions_created_by_idx on public.marketplace_promotions (created_by_user_id);
create index marketplace_promotions_cancelled_by_idx on public.marketplace_promotions (cancelled_by_user_id)
  where cancelled_by_user_id is not null;

alter table public.vendor_promotions enable row level security;
alter table public.site_banners enable row level security;
alter table public.marketplace_promotions enable row level security;

revoke all on public.vendor_promotions, public.site_banners, public.marketplace_promotions
  from public, anon, authenticated;
grant select, insert, update, delete on public.vendor_promotions,
  public.site_banners, public.marketplace_promotions to service_role;

-- Banner files are public marketing material, but only the service role can
-- mutate them. Admin uploads are checked and performed by the server route.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'marketing-assets', 'marketing-assets', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.order_price_snapshots
  add column marketplace_promotion_id uuid references public.marketplace_promotions(id) on delete set null,
  add column marketplace_promotion_title text check (marketplace_promotion_title is null or char_length(marketplace_promotion_title) <= 100),
  add column service_fee_event_discount_percent smallint not null default 0
    check (service_fee_event_discount_percent between 0 and 100),
  add column delivery_event_discount_percent smallint not null default 0
    check (delivery_event_discount_percent between 0 and 100),
  add column delivery_fee_before_event_discount numeric(12,2) check (delivery_fee_before_event_discount >= 0);

create index order_price_snapshots_marketplace_promotion_idx
  on public.order_price_snapshots (marketplace_promotion_id)
  where marketplace_promotion_id is not null;

comment on table public.vendor_promotions is
  'Time-limited, cancellable premium placement. Active rows rank verified stores above organic results and must be labelled as advertising.';
comment on table public.site_banners is
  'Admin-authored marketplace advertising banners. Images live in the public marketing-assets bucket.';
comment on table public.marketplace_promotions is
  'Time-limited global discounts applied after the customer introductory fee and to the once-per-order delivery charge.';
comment on column public.order_price_snapshots.marketplace_promotion_id is
  'The event campaign used at checkout. Other snapshot fields retain the exact arithmetic if the campaign is later deleted.';
