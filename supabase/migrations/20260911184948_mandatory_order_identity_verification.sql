-- Every new order must consume one successful, order-specific hosted identity
-- check. Get Gold stores no document images, document numbers, selfies or
-- biometric templates; those remain with the contracted verification provider.
create table if not exists public.order_identity_verifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  verification_route text not null
    check (verification_route in ('uae_resident', 'visitor')),
  provider text not null default 'sumsub' check (provider = 'sumsub'),
  provider_external_user_id text not null unique,
  provider_applicant_id text,
  status text not null default 'pending'
    check (status in ('pending', 'in_review', 'approved', 'rejected', 'error', 'expired', 'consumed')),
  result_code text,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  verified_at timestamptz,
  consumed_at timestamptz,
  reservation_id uuid unique references public.reservations(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists order_identity_verifications_user_idx
  on public.order_identity_verifications (user_id, created_at desc);
create index if not exists order_identity_verifications_status_idx
  on public.order_identity_verifications (status, expires_at);

alter table public.order_identity_verifications enable row level security;

-- Verification status is read and written only by authenticated server routes.
-- RLS remains enabled as a second boundary if grants change in the future.
revoke all on table public.order_identity_verifications from anon;
revoke all on table public.order_identity_verifications from authenticated;

drop trigger if exists touch_order_identity_verifications on public.order_identity_verifications;
create trigger touch_order_identity_verifications
  before update on public.order_identity_verifications
  for each row execute function public.touch_updated_at();

alter table public.reservations
  add column if not exists identity_verification_id uuid unique
    references public.order_identity_verifications(id) on delete restrict;

comment on table public.order_identity_verifications is
  'Minimal pass/fail metadata for one hosted identity check per order; no identity documents or biometrics are stored in Get Gold.';
comment on column public.order_identity_verifications.verification_route is
  'uae_resident requires Emirates ID front/back plus liveness face match; visitor requires passport, boarding pass and liveness face match in the provider workflow.';
comment on column public.reservations.identity_verification_id is
  'Single-use identity check consumed atomically by this reservation.';

-- Replace the fulfilment-aware function while preserving the row lock, stock
-- count and SETOF return contract. Identity approval is locked and consumed in
-- the same transaction, so one successful check cannot authorize two orders.
drop function if exists public.claim_reservation(
  uuid, uuid, integer, timestamptz, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
);

create function public.claim_reservation(
  p_customer_user_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz,
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
security definer
set search_path = public
as $$
declare
  v_product public.products;
  v_identity public.order_identity_verifications;
  v_taken integer;
  v_reservation public.reservations;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid_quantity';
  end if;

  if p_identity_verification_id is null then
    raise exception 'identity_verification_required';
  end if;

  select * into v_identity
  from public.order_identity_verifications
  where id = p_identity_verification_id
  for update;

  if not found
    or v_identity.user_id <> p_customer_user_id
    or v_identity.product_id <> p_product_id then
    raise exception 'identity_verification_invalid';
  end if;

  if v_identity.consumed_at is not null or v_identity.reservation_id is not null then
    raise exception 'identity_verification_already_used';
  end if;

  if v_identity.status <> 'approved' or v_identity.verified_at is null then
    raise exception 'identity_verification_not_approved';
  end if;

  if v_identity.expires_at <= now() then
    raise exception 'identity_verification_expired';
  end if;

  if p_fulfilment_method not in ('delivery', 'collection') then
    raise exception 'invalid_fulfilment_method';
  end if;

  if p_fulfilment_method = 'delivery' and (
    nullif(btrim(p_recipient_name), '') is null
    or nullif(btrim(p_recipient_phone), '') is null
    or nullif(btrim(p_delivery_emirate), '') is null
    or nullif(btrim(p_delivery_area), '') is null
    or nullif(btrim(p_delivery_address_line_1), '') is null
    or (
      (p_delivery_latitude is null or p_delivery_longitude is null)
      and nullif(btrim(p_delivery_map_link), '') is null
    )
  ) then
    raise exception 'delivery_details_required';
  end if;

  if (p_delivery_latitude is null) <> (p_delivery_longitude is null)
    or p_delivery_latitude not between -90 and 90
    or p_delivery_longitude not between -180 and 180 then
    raise exception 'invalid_delivery_coordinates';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'product_not_found';
  end if;

  if v_product.product_status <> 'approved' then
    raise exception 'product_not_available';
  end if;

  select coalesce(sum(r.quantity), 0)::integer into v_taken
  from public.reservations r
  where r.product_id = p_product_id
    and (
      r.status = 'paid'
      or (
        r.status in ('pending_vendor_confirmation', 'payment_link_pending', 'payment_pending')
        and r.expires_at > now()
      )
    );

  if v_taken + p_quantity > v_product.quantity then
    raise exception 'insufficient_stock';
  end if;

  insert into public.reservations (
    customer_user_id,
    product_id,
    vendor_id,
    status,
    quantity,
    expires_at,
    identity_verification_id,
    fulfilment_method,
    recipient_name,
    recipient_phone,
    delivery_emirate,
    delivery_area,
    delivery_address_line_1,
    delivery_address_line_2,
    delivery_landmark,
    delivery_latitude,
    delivery_longitude,
    delivery_map_link,
    customer_note
  ) values (
    p_customer_user_id,
    p_product_id,
    v_product.vendor_id,
    'pending_vendor_confirmation',
    p_quantity,
    p_expires_at,
    p_identity_verification_id,
    p_fulfilment_method,
    nullif(btrim(p_recipient_name), ''),
    nullif(btrim(p_recipient_phone), ''),
    nullif(btrim(p_delivery_emirate), ''),
    nullif(btrim(p_delivery_area), ''),
    nullif(btrim(p_delivery_address_line_1), ''),
    nullif(btrim(p_delivery_address_line_2), ''),
    nullif(btrim(p_delivery_landmark), ''),
    p_delivery_latitude,
    p_delivery_longitude,
    nullif(btrim(p_delivery_map_link), ''),
    nullif(btrim(p_customer_note), '')
  )
  returning * into v_reservation;

  update public.order_identity_verifications
  set status = 'consumed',
      consumed_at = now(),
      reservation_id = v_reservation.id
  where id = v_identity.id;

  return next v_reservation;
  return;
end
$$;

revoke all on function public.claim_reservation(
  uuid, uuid, integer, timestamptz, uuid, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
) from public;
revoke all on function public.claim_reservation(
  uuid, uuid, integer, timestamptz, uuid, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
) from anon;
revoke all on function public.claim_reservation(
  uuid, uuid, integer, timestamptz, uuid, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
) from authenticated;

notify pgrst, 'reload schema';
