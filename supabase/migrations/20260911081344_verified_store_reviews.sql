-- Verified store reviews and rolling seller-performance signals.
-- Reviews are written only through authenticated server routes. Keeping the
-- write path server-side lets the database derive customer/vendor/product from
-- a paid reservation instead of trusting browser-supplied ownership fields.

do $$ begin
  create type public.review_moderation_status as enum ('published', 'hidden');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_report_status as enum ('open', 'dismissed', 'actioned');
exception when duplicate_object then null; end $$;

alter table public.reservations
  add column if not exists vendor_responded_at timestamptz;

-- This is the best available timestamp for orders that predate the dedicated
-- response column. New responses write the exact timestamp in the API route.
update public.reservations
set vendor_responded_at = updated_at
where vendor_responded_at is null
  and status in ('payment_link_pending', 'payment_pending', 'paid', 'refunded', 'rejected_by_vendor');

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique references public.reservations(id) on delete restrict,
  customer_user_id uuid not null references public.profiles(id) on delete restrict,
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  customer_display_name text not null check (char_length(customer_display_name) between 1 and 80),
  overall_rating smallint not null check (overall_rating between 1 and 5),
  product_rating smallint not null check (product_rating between 1 and 5),
  communication_rating smallint not null check (communication_rating between 1 and 5),
  fulfilment_rating smallint not null check (fulfilment_rating between 1 and 5),
  packaging_rating smallint not null check (packaging_rating between 1 and 5),
  delivery_rating smallint check (delivery_rating between 1 and 5),
  title text check (title is null or char_length(title) between 2 and 120),
  comment text check (comment is null or char_length(comment) between 10 and 2000),
  moderation_status public.review_moderation_status not null default 'published',
  moderation_note text check (moderation_note is null or char_length(moderation_note) <= 500),
  moderated_by uuid references public.profiles(id) on delete set null,
  moderated_at timestamptz,
  editable_until timestamptz not null default (now() + interval '14 days'),
  vendor_reply text check (vendor_reply is null or char_length(vendor_reply) between 2 and 1000),
  vendor_reply_status public.review_moderation_status not null default 'published',
  vendor_replied_at timestamptz,
  vendor_reply_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reviews_vendor_status_idx
  on public.reviews (vendor_id, moderation_status, created_at desc);
create index if not exists reviews_product_status_idx
  on public.reviews (product_id, moderation_status, created_at desc);
create index if not exists reviews_customer_idx
  on public.reviews (customer_user_id, created_at desc);
create index if not exists reviews_moderated_by_idx
  on public.reviews (moderated_by)
  where moderated_by is not null;

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in (
    'spam', 'fake_or_misleading', 'abusive', 'personal_information', 'other'
  )),
  details text check (details is null or char_length(details) <= 1000),
  status public.review_report_status not null default 'open',
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(resolution_note) <= 500),
  created_at timestamptz not null default now(),
  unique (review_id, reporter_user_id)
);

create index if not exists review_reports_status_idx
  on public.review_reports (status, created_at desc);
create index if not exists review_reports_review_idx
  on public.review_reports (review_id, created_at desc);
create index if not exists review_reports_reporter_idx
  on public.review_reports (reporter_user_id, created_at desc);
create index if not exists review_reports_resolved_by_idx
  on public.review_reports (resolved_by)
  where resolved_by is not null;

-- Enforce the verified-purchase relationship inside Postgres as well as in the
-- API. A review cannot be re-pointed to another order, customer, shop or item.
create or replace function public.set_verified_review_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  purchase public.reservations%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.reservation_id <> old.reservation_id then
      raise exception 'A review cannot be moved to another reservation';
    end if;

    new.customer_user_id = old.customer_user_id;
    new.vendor_id = old.vendor_id;
    new.product_id = old.product_id;
    return new;
  end if;

  select * into purchase
  from public.reservations
  where id = new.reservation_id
    and status = 'paid';

  if not found then
    raise exception 'Only paid reservations can be reviewed';
  end if;

  new.customer_user_id = purchase.customer_user_id;
  new.vendor_id = purchase.vendor_id;
  new.product_id = purchase.product_id;
  return new;
end;
$$;

revoke all on function public.set_verified_review_context() from public, anon, authenticated;
grant execute on function public.set_verified_review_context() to service_role;

drop trigger if exists set_verified_review_context on public.reviews;
create trigger set_verified_review_context
before insert or update on public.reviews
for each row execute function public.set_verified_review_context();

drop trigger if exists touch_reviews on public.reviews;
create trigger touch_reviews
before update on public.reviews
for each row execute function public.touch_updated_at();

alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;

-- The current app reads and writes reviews through server components/routes
-- after explicit authorization checks. Do not expose customer UUIDs, moderation
-- notes or report data directly through the browser Data API.
revoke all on table public.reviews from anon, authenticated;
revoke all on table public.review_reports from anon, authenticated;
grant select, insert, update, delete on table public.reviews to service_role;
grant select, insert, update, delete on table public.review_reports to service_role;

-- Aggregated seller reputation. security_invoker prevents the view from ever
-- becoming an accidental RLS bypass if its grants are expanded in the future.
create or replace view public.vendor_reputation_summary
with (security_invoker = true)
as
with review_stats as (
  select
    vendor_id,
    count(*)::bigint as review_count,
    avg(overall_rating)::numeric as average_rating,
    avg(product_rating)::numeric as product_rating,
    avg(communication_rating)::numeric as communication_rating,
    avg(fulfilment_rating)::numeric as fulfilment_rating,
    avg(packaging_rating)::numeric as packaging_rating,
    avg(delivery_rating)::numeric as delivery_rating
  from public.reviews
  where moderation_status = 'published'
  group by vendor_id
),
order_stats as (
  select
    vendor_id,
    count(*) filter (where status <> 'cancelled')::bigint as response_eligible_order_count,
    count(*) filter (where vendor_responded_at is not null)::bigint as response_count,
    avg(extract(epoch from (vendor_responded_at - created_at)) / 60.0)
      filter (where vendor_responded_at is not null) as avg_response_minutes,
    count(*) filter (where status in ('paid', 'refunded', 'rejected_by_vendor'))::bigint
      as resolved_order_count,
    count(*) filter (where status in ('paid', 'refunded'))::bigint as fulfilled_order_count,
    count(*) filter (where status = 'rejected_by_vendor')::bigint as vendor_cancelled_order_count
  from public.reservations
  where created_at >= now() - interval '90 days'
  group by vendor_id
),
incident_stats as (
  select reviews.vendor_id, count(*)::bigint as moderated_incident_count_90d
  from public.review_reports
  join public.reviews on reviews.id = review_reports.review_id
  where review_reports.status = 'actioned'
    and review_reports.resolved_at >= now() - interval '90 days'
  group by reviews.vendor_id
)
select
  vendors.id as vendor_id,
  vendors.created_at as vendor_created_at,
  coalesce(review_stats.review_count, 0)::bigint as review_count,
  round(review_stats.average_rating, 2) as average_rating,
  case
    when coalesce(review_stats.review_count, 0) = 0 then null
    else round(
      (
        review_stats.average_rating * review_stats.review_count +
        4.2::numeric * 10::numeric
      ) / (review_stats.review_count + 10),
      2
    )
  end as adjusted_rating,
  round(review_stats.product_rating, 2) as product_rating,
  round(review_stats.communication_rating, 2) as communication_rating,
  round(review_stats.fulfilment_rating, 2) as fulfilment_rating,
  round(review_stats.packaging_rating, 2) as packaging_rating,
  round(review_stats.delivery_rating, 2) as delivery_rating,
  coalesce(order_stats.response_eligible_order_count, 0)::bigint as response_eligible_order_count,
  coalesce(order_stats.response_count, 0)::bigint as response_count,
  case
    when coalesce(order_stats.response_eligible_order_count, 0) = 0 then null
    else round(
      order_stats.response_count::numeric / order_stats.response_eligible_order_count * 100,
      1
    )
  end as response_rate_percent,
  round(order_stats.avg_response_minutes::numeric, 1) as avg_response_minutes,
  coalesce(order_stats.resolved_order_count, 0)::bigint as resolved_order_count,
  coalesce(order_stats.fulfilled_order_count, 0)::bigint as fulfilled_order_count,
  case
    when coalesce(order_stats.resolved_order_count, 0) = 0 then null
    else round(
      order_stats.fulfilled_order_count::numeric / order_stats.resolved_order_count * 100,
      1
    )
  end as fulfilment_rate_percent,
  case
    when coalesce(order_stats.resolved_order_count, 0) = 0 then null
    else round(
      coalesce(order_stats.vendor_cancelled_order_count, 0)::numeric /
        order_stats.resolved_order_count * 100,
      1
    )
  end as vendor_cancellation_rate_percent,
  coalesce(incident_stats.moderated_incident_count_90d, 0)::bigint
    as moderated_incident_count_90d
from public.vendors
left join review_stats on review_stats.vendor_id = vendors.id
left join order_stats on order_stats.vendor_id = vendors.id
left join incident_stats on incident_stats.vendor_id = vendors.id;

revoke all on table public.vendor_reputation_summary from public, anon, authenticated;
grant select on table public.vendor_reputation_summary to service_role;
