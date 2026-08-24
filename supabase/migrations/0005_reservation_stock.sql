-- ============================================================================
--  Stock accounting for reservations.
--
--  Before this, products.quantity was read but never reduced and in-flight
--  reservations were not counted, so the same unit could be reserved by any
--  number of customers at once.
--
--  Availability is derived rather than stored: a unit is considered taken by a
--  paid reservation permanently, or by a pending one until it expires. That
--  keeps expiry cheap (no compensating write) and cannot drift out of sync.
-- ============================================================================

-- Statuses that hold stock. Pending holds only while unexpired.
create or replace function public.reserved_quantity(p_product_id uuid)
returns integer
language sql
stable
as $$
  select coalesce(sum(r.quantity), 0)::integer
  from public.reservations r
  where r.product_id = p_product_id
    and (
      r.status = 'paid'
      or (
        r.status in ('pending_vendor_confirmation', 'payment_link_pending', 'payment_pending')
        and r.expires_at > now()
      )
    );
$$;

create or replace function public.available_quantity(p_product_id uuid)
returns integer
language sql
stable
as $$
  select greatest(0, p.quantity - public.reserved_quantity(p.id))::integer
  from public.products p
  where p.id = p_product_id;
$$;

-- ---------------------------------------------------------------------------
--  Atomic claim.
--
--  Takes a row lock on the product so two concurrent callers cannot both pass
--  the availability check. Raises on failure; the API maps the message to a
--  status code. SECURITY DEFINER so it can insert regardless of RLS, and
--  execute is revoked from anon/authenticated — only the service role calls it.
-- ---------------------------------------------------------------------------
-- Dropped first: CREATE OR REPLACE cannot change a function's return type.
drop function if exists public.claim_reservation(uuid, uuid, integer, timestamptz);

-- Returns SETOF rather than a bare composite so PostgREST always emits a row
-- collection, which is what supabase-js .single() expects. A bare composite
-- return is handled inconsistently across the two and is not worth the risk on
-- the reservation path.
create function public.claim_reservation(
  p_customer_user_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_expires_at timestamptz
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
    customer_user_id, product_id, vendor_id, status, quantity, expires_at
  ) values (
    p_customer_user_id, p_product_id, v_product.vendor_id,
    'pending_vendor_confirmation', p_quantity, p_expires_at
  )
  returning * into v_reservation;

  return next v_reservation;
  return;
end
$$;

revoke all on function public.claim_reservation(uuid, uuid, integer, timestamptz) from public;
revoke all on function public.claim_reservation(uuid, uuid, integer, timestamptz) from anon;
revoke all on function public.claim_reservation(uuid, uuid, integer, timestamptz) from authenticated;
