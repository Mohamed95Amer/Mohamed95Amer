-- Store the customer's chosen fulfilment details on the reservation itself.
-- This is an order snapshot: later profile changes must not rewrite an order's
-- delivery destination. Existing reservations become collection orders.
alter table public.reservations
  add column if not exists fulfilment_method text not null default 'collection'
    check (fulfilment_method in ('delivery', 'collection')),
  add column if not exists recipient_name text,
  add column if not exists recipient_phone text,
  add column if not exists delivery_emirate text,
  add column if not exists delivery_area text,
  add column if not exists delivery_address_line_1 text,
  add column if not exists delivery_address_line_2 text,
  add column if not exists delivery_landmark text,
  add column if not exists delivery_latitude numeric(9,6),
  add column if not exists delivery_longitude numeric(9,6),
  add column if not exists delivery_map_link text,
  add column if not exists customer_note text;

alter table public.reservations
  drop constraint if exists reservations_delivery_coordinates_check,
  add constraint reservations_delivery_coordinates_check check (
    (delivery_latitude is null) = (delivery_longitude is null)
    and (
      delivery_latitude is null
      or (
        delivery_latitude between -90 and 90
        and delivery_longitude between -180 and 180
      )
    )
  ),
  drop constraint if exists reservations_delivery_details_check,
  add constraint reservations_delivery_details_check check (
    fulfilment_method = 'collection'
    or (
      nullif(btrim(recipient_name), '') is not null
      and nullif(btrim(recipient_phone), '') is not null
      and nullif(btrim(delivery_emirate), '') is not null
      and nullif(btrim(delivery_area), '') is not null
      and nullif(btrim(delivery_address_line_1), '') is not null
      and (
        (delivery_latitude is not null and delivery_longitude is not null)
        or nullif(btrim(delivery_map_link), '') is not null
      )
    )
  );

comment on column public.reservations.fulfilment_method is
  'Customer-selected delivery or store collection method captured when stock is claimed.';
comment on column public.reservations.delivery_map_link is
  'Optional customer-provided HTTPS map pin; coordinates are preferred when device location is available.';

-- Keep stock claiming, fulfilment details and the order row in one transaction.
-- Optional defaults preserve the original four-argument SQL call for tests and
-- operational scripts, while PostgREST sends every named argument from the API.
drop function if exists public.claim_reservation(uuid, uuid, integer, timestamptz);

create function public.claim_reservation(
  p_customer_user_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz,
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
  v_taken integer;
  v_reservation public.reservations;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'invalid_quantity';
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

  return next v_reservation;
  return;
end
$$;

revoke all on function public.claim_reservation(
  uuid, uuid, integer, timestamptz, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
) from public;
revoke all on function public.claim_reservation(
  uuid, uuid, integer, timestamptz, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
) from anon;
revoke all on function public.claim_reservation(
  uuid, uuid, integer, timestamptz, text, text, text, text, text, text,
  text, text, numeric, numeric, text, text
) from authenticated;

notify pgrst, 'reload schema';
