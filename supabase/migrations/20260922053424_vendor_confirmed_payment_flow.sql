-- Vendor-confirmed direct payment flow.  A purchase request does not hold
-- stock.  Stock is acquired atomically only after the customer accepts the
-- vendor-confirmed price.  Direct transfers are verified by the vendor, never
-- by a customer-supplied screenshot.

alter table public.vendor_payment_settings
  add column if not exists aani_enabled boolean not null default false,
  add column if not exists aani_mobile text not null default '';

alter table public.vendor_payment_settings
  drop constraint if exists vendor_payment_settings_aani_mobile_check;
alter table public.vendor_payment_settings
  add constraint vendor_payment_settings_aani_mobile_check
  check (not aani_enabled or aani_mobile ~ '^\+9715[0-9]{8}$');

alter table public.reservations
  drop constraint if exists reservations_payment_method_check;
alter table public.reservations
  add constraint reservations_payment_method_check
  check (payment_method in ('pay_at_store','pay_online','bank_transfer','aani','cash','card'));

alter table public.reservations
  drop constraint if exists reservations_payment_status_check;
alter table public.reservations
  add constraint reservations_payment_status_check check (payment_status in (
    'not_required', 'awaiting_store_confirmation', 'awaiting_customer_acceptance',
    'awaiting_customer_payment', 'verification_pending', 'awaiting_checkout',
    'processing', 'paid', 'failed', 'refunded'
  ));

alter table public.reservations
  add column if not exists vendor_action_available_at timestamptz not null default now(),
  add column if not exists submitted_during_working_hours boolean not null default true,
  add column if not exists vendor_confirmed_price_aed numeric(12,2),
  add column if not exists vendor_price_confirmed_at timestamptz,
  add column if not exists customer_price_accepted_at timestamptz,
  add column if not exists payment_window_started_at timestamptz,
  add column if not exists preparing_at timestamptz,
  add column if not exists ready_at timestamptz,
  add column if not exists out_for_delivery_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists completed_at timestamptz;

alter table public.reservations
  drop constraint if exists reservations_vendor_confirmed_price_check;
alter table public.reservations
  add constraint reservations_vendor_confirmed_price_check
  check (vendor_confirmed_price_aed is null or vendor_confirmed_price_aed between 0.01 and 100000000);

create table if not exists public.vendor_working_hours (
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  is_open boolean not null default true,
  opens_at time not null default '10:00',
  closes_at time not null default '22:00',
  updated_at timestamptz not null default now(),
  primary key (vendor_id, day_of_week),
  check (not is_open or opens_at < closes_at)
);

comment on column public.vendor_working_hours.day_of_week is
  'Dubai-local weekday, Sunday=0 through Saturday=6.';

insert into public.vendor_working_hours (vendor_id, day_of_week)
select v.id, d.day_of_week
from public.vendors v
cross join generate_series(0, 6) as d(day_of_week)
on conflict (vendor_id, day_of_week) do nothing;

alter table public.vendor_working_hours enable row level security;
revoke all on public.vendor_working_hours from public, anon, authenticated;
grant all on public.vendor_working_hours to service_role;

alter table public.notifications
  add column if not exists available_at timestamptz not null default now();
create index if not exists notifications_user_available_idx
  on public.notifications (user_id, available_at, created_at desc);

-- A pending request is not stock.  Accepted payment windows and payment
-- verification hold stock; paid/fulfilment states consume it permanently.
create or replace function public.reserved_quantity(p_product_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(r.quantity), 0)::integer
  from public.reservations r
  where r.product_id = p_product_id
    and (
      r.status in (
        'paid', 'payment_verification', 'payment_confirmed', 'preparing_order',
        'ready_for_delivery', 'out_for_delivery', 'delivered', 'completed'
      )
      or (
        r.status in ('payment_link_pending', 'payment_pending')
        and r.expires_at > now()
      )
      or (
        -- Compatibility for the legacy atomic claim RPC used by historical
        -- tests and maintenance tools.  New purchase requests explicitly use
        -- awaiting_store_confirmation and therefore do not hold stock.
        r.status = 'pending_vendor_confirmation'
        and r.payment_status = 'not_required'
        and r.expires_at > now()
      )
    );
$$;

create or replace function public.available_quantity(p_product_id uuid)
returns integer
language sql
stable
set search_path = ''
as $$
  select greatest(0, p.quantity - public.reserved_quantity(p.id))::integer
  from public.products p
  where p.id = p_product_id;
$$;

-- Create the identity-bound request without acquiring stock.  This remains a
-- database transaction rather than a bare insert so the one-use identity
-- result cannot authorize two requests.
create function public.create_vendor_order_request(
  p_customer_user_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz,
  p_vendor_action_available_at timestamptz,
  p_submitted_during_working_hours boolean,
  p_identity_verification_id uuid,
  p_fulfilment_method text default 'collection',
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_delivery_emirate text default null,
  p_delivery_area text default null,
  p_delivery_address_line_1 text default null,
  p_delivery_address_line_2 text default null,
  p_delivery_landmark text default null,
  p_delivery_latitude numeric default null,
  p_delivery_longitude numeric default null,
  p_delivery_map_link text default null,
  p_customer_note text default null
)
returns setof public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product public.products;
  v_identity public.order_identity_verifications;
  v_reservation public.reservations;
begin
  if p_quantity is null or p_quantity < 1 then raise exception 'invalid_quantity'; end if;
  if p_identity_verification_id is null then raise exception 'identity_verification_required'; end if;

  select * into v_identity from public.order_identity_verifications
  where id = p_identity_verification_id for update;
  if not found or v_identity.user_id <> p_customer_user_id or v_identity.product_id <> p_product_id then
    raise exception 'identity_verification_invalid';
  end if;
  if v_identity.consumed_at is not null or v_identity.reservation_id is not null then
    raise exception 'identity_verification_already_used';
  end if;
  if v_identity.status <> 'approved' or v_identity.verified_at is null then
    raise exception 'identity_verification_not_approved';
  end if;
  if v_identity.expires_at <= clock_timestamp() then raise exception 'identity_verification_expired'; end if;

  if p_fulfilment_method not in ('delivery','collection') then raise exception 'invalid_fulfilment_method'; end if;
  if p_fulfilment_method = 'delivery' and (
    nullif(btrim(p_recipient_name),'') is null or nullif(btrim(p_recipient_phone),'') is null
    or nullif(btrim(p_delivery_emirate),'') is null or nullif(btrim(p_delivery_area),'') is null
    or nullif(btrim(p_delivery_address_line_1),'') is null
    or ((p_delivery_latitude is null or p_delivery_longitude is null) and nullif(btrim(p_delivery_map_link),'') is null)
  ) then raise exception 'delivery_details_required'; end if;
  if (p_delivery_latitude is null) <> (p_delivery_longitude is null)
    or p_delivery_latitude not between -90 and 90
    or p_delivery_longitude not between -180 and 180 then
    raise exception 'invalid_delivery_coordinates';
  end if;

  select * into v_product from public.products where id = p_product_id for share;
  if not found then raise exception 'product_not_found'; end if;
  if v_product.product_status <> 'approved' or v_product.quantity < 1 then
    raise exception 'product_not_available';
  end if;

  insert into public.reservations (
    customer_user_id, product_id, vendor_id, status, quantity, expires_at,
    vendor_action_available_at, submitted_during_working_hours,
    identity_verification_id, fulfilment_method, recipient_name, recipient_phone,
    delivery_emirate, delivery_area, delivery_address_line_1,
    delivery_address_line_2, delivery_landmark, delivery_latitude,
    delivery_longitude, delivery_map_link, customer_note, payment_status
  ) values (
    p_customer_user_id, p_product_id, v_product.vendor_id,
    'pending_vendor_confirmation', p_quantity, p_expires_at,
    greatest(p_vendor_action_available_at, clock_timestamp()),
    p_submitted_during_working_hours, p_identity_verification_id,
    p_fulfilment_method, nullif(btrim(p_recipient_name),''),
    nullif(btrim(p_recipient_phone),''), nullif(btrim(p_delivery_emirate),''),
    nullif(btrim(p_delivery_area),''), nullif(btrim(p_delivery_address_line_1),''),
    nullif(btrim(p_delivery_address_line_2),''), nullif(btrim(p_delivery_landmark),''),
    p_delivery_latitude, p_delivery_longitude, nullif(btrim(p_delivery_map_link),''),
    nullif(btrim(p_customer_note),''), 'awaiting_store_confirmation'
  ) returning * into v_reservation;

  update public.order_identity_verifications
  set status='consumed', consumed_at=clock_timestamp(), reservation_id=v_reservation.id
  where id=v_identity.id;

  return next v_reservation;
  return;
end $$;

revoke all on function public.create_vendor_order_request(
  uuid,uuid,integer,timestamptz,timestamptz,boolean,uuid,text,text,text,text,text,
  text,text,text,numeric,numeric,text,text
) from public, anon, authenticated;
grant execute on function public.create_vendor_order_request(
  uuid,uuid,integer,timestamptz,timestamptz,boolean,uuid,text,text,text,text,text,
  text,text,text,numeric,numeric,text,text
) to service_role;

create function public.confirm_vendor_order_price(
  p_reservation_id uuid,
  p_vendor_user_id uuid,
  p_confirmed_price_aed numeric,
  p_note text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_order public.reservations;
begin
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if not exists (
    select 1 from public.vendors where id=v_order.vendor_id
      and owner_user_id=p_vendor_user_id and verification_status='approved'
  ) then raise exception 'not_authorized'; end if;
  if v_order.status <> 'pending_vendor_confirmation'
    or v_order.vendor_action_available_at > clock_timestamp()
    or v_order.expires_at <= clock_timestamp() then
    raise exception 'order_changed_or_not_open';
  end if;
  if p_confirmed_price_aed is null or p_confirmed_price_aed <= 0 then
    raise exception 'invalid_confirmed_price';
  end if;

  update public.reservations set
    status='vendor_confirmed', payment_status='awaiting_customer_acceptance',
    vendor_confirmed_price_aed=round(p_confirmed_price_aed,2),
    vendor_price_confirmed_at=clock_timestamp(), vendor_responded_at=clock_timestamp(),
    vendor_response_note=nullif(btrim(p_note),''),
    expires_at=clock_timestamp()+interval '24 hours'
  where id=p_reservation_id;
  return p_reservation_id;
end $$;
revoke all on function public.confirm_vendor_order_price(uuid,uuid,numeric,text) from public,anon,authenticated;
grant execute on function public.confirm_vendor_order_price(uuid,uuid,numeric,text) to service_role;

-- Product row lock + stock count is the non-negotiable oversell boundary.
create function public.accept_vendor_confirmed_price(
  p_reservation_id uuid,
  p_customer_user_id uuid,
  p_payment_window_minutes integer default 30
)
returns setof public.reservations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_product public.products;
  v_order public.reservations;
  v_taken integer;
begin
  if p_payment_window_minutes not between 5 and 1440 then raise exception 'invalid_payment_window'; end if;
  select product_id into v_product_id from public.reservations where id=p_reservation_id;
  if v_product_id is null then raise exception 'order_not_found'; end if;
  select * into v_product from public.products where id=v_product_id for update;
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if v_order.customer_user_id <> p_customer_user_id then raise exception 'not_authorized'; end if;
  if v_order.status <> 'vendor_confirmed' or v_order.expires_at <= clock_timestamp()
    or v_order.vendor_confirmed_price_aed is null then
    raise exception 'order_changed_or_expired';
  end if;
  if v_product.product_status <> 'approved' then raise exception 'product_not_available'; end if;

  select coalesce(sum(r.quantity),0)::integer into v_taken
  from public.reservations r
  where r.product_id=v_product_id and r.id<>p_reservation_id and (
    r.status in ('paid','payment_verification','payment_confirmed','preparing_order',
      'ready_for_delivery','out_for_delivery','delivered','completed')
    or (r.status in ('payment_link_pending','payment_pending') and r.expires_at>clock_timestamp())
    or (r.status='pending_vendor_confirmation' and r.payment_status='not_required' and r.expires_at>clock_timestamp())
  );
  if v_taken + v_order.quantity > v_product.quantity then raise exception 'insufficient_stock'; end if;

  update public.reservations set
    status='payment_pending', payment_status='awaiting_customer_payment',
    customer_price_accepted_at=clock_timestamp(), payment_window_started_at=clock_timestamp(),
    expires_at=clock_timestamp()+make_interval(mins=>p_payment_window_minutes)
  where id=p_reservation_id
  returning * into v_order;
  return next v_order;
  return;
end $$;
revoke all on function public.accept_vendor_confirmed_price(uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.accept_vendor_confirmed_price(uuid,uuid,integer) to service_role;

create function public.confirm_vendor_direct_payment(p_reservation_id uuid, p_vendor_user_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_product_id uuid; v_order public.reservations;
begin
  select product_id into v_product_id from public.reservations where id=p_reservation_id;
  if v_product_id is null then raise exception 'order_not_found'; end if;
  perform 1 from public.products where id=v_product_id for update;
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if not exists (
    select 1 from public.vendors where id=v_order.vendor_id
      and owner_user_id=p_vendor_user_id and verification_status='approved'
  ) then raise exception 'not_authorized'; end if;
  if v_order.payment_method not in ('bank_transfer','aani')
    or v_order.status <> 'payment_verification'
    or v_order.transfer_submitted_at is null then
    raise exception 'order_not_awaiting_verification';
  end if;
  update public.reservations set status='payment_confirmed', payment_status='paid',
    payment_confirmed_at=clock_timestamp(), expires_at=clock_timestamp()+interval '30 days'
  where id=p_reservation_id;
  return p_reservation_id;
end $$;
revoke all on function public.confirm_vendor_direct_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_vendor_direct_payment(uuid,uuid) to service_role;

create function public.advance_vendor_order(
  p_reservation_id uuid,
  p_vendor_user_id uuid,
  p_action text
)
returns public.reservation_status
language plpgsql
security invoker
set search_path = ''
as $$
declare v_order public.reservations; v_next public.reservation_status;
begin
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if not found or not exists (
    select 1 from public.vendors where id=v_order.vendor_id
      and owner_user_id=p_vendor_user_id and verification_status='approved'
  ) then raise exception 'not_authorized'; end if;

  v_next := (case
    when p_action='start_preparing' and v_order.status='payment_confirmed' then 'preparing_order'
    when p_action='mark_ready' and v_order.status='preparing_order' then 'ready_for_delivery'
    when p_action='mark_out_for_delivery' and v_order.status='ready_for_delivery' and v_order.fulfilment_method='delivery' then 'out_for_delivery'
    when p_action='mark_delivered' and v_order.status='out_for_delivery' and v_order.fulfilment_method='delivery' then 'delivered'
    when p_action='complete' and v_order.status='delivered' then 'completed'
    when p_action='complete' and v_order.status='ready_for_delivery' and v_order.fulfilment_method='collection' then 'completed'
    else null
  end)::public.reservation_status;
  if v_next is null then raise exception 'invalid_transition'; end if;

  update public.reservations set
    status=v_next,
    preparing_at=case when v_next='preparing_order' then clock_timestamp() else preparing_at end,
    ready_at=case when v_next='ready_for_delivery' then clock_timestamp() else ready_at end,
    out_for_delivery_at=case when v_next='out_for_delivery' then clock_timestamp() else out_for_delivery_at end,
    delivered_at=case when v_next='delivered' then clock_timestamp() else delivered_at end,
    completed_at=case when v_next='completed' then clock_timestamp() else completed_at end
  where id=p_reservation_id;
  return v_next;
end $$;
revoke all on function public.advance_vendor_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.advance_vendor_order(uuid,uuid,text) to service_role;

-- Legacy `paid` rows remain reviewable.  New orders become reviewable only
-- after fulfilment is completed.
create or replace function public.set_verified_review_context()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare purchase public.reservations%rowtype;
begin
  if tg_op = 'UPDATE' then
    if new.reservation_id <> old.reservation_id then raise exception 'A review cannot be moved to another reservation'; end if;
    new.customer_user_id=old.customer_user_id; new.vendor_id=old.vendor_id; new.product_id=old.product_id;
    return new;
  end if;
  select * into purchase from public.reservations
  where id=new.reservation_id and status in ('paid','completed');
  if not found then raise exception 'Only completed reservations can be reviewed'; end if;
  new.customer_user_id=purchase.customer_user_id; new.vendor_id=purchase.vendor_id; new.product_id=purchase.product_id;
  return new;
end $$;
revoke all on function public.set_verified_review_context() from public,anon,authenticated;
grant execute on function public.set_verified_review_context() to service_role;

notify pgrst, 'reload schema';
