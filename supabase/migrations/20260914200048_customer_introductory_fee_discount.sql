-- Customer-funded Phase 1 fee: 1% standard, discounted 50% for three orders.
-- Promo slots are held by active reservations, retained by paid/refunded orders,
-- and become reusable when an order is rejected, cancelled or expires.
update public.platform_settings set platform_fee_bps = 100 where id = true;

create table public.customer_fee_promotions (
  customer_user_id uuid not null references public.profiles(id) on delete cascade,
  promo_order_number smallint not null check (promo_order_number between 1 and 3),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,
  claimed_at timestamptz not null default now(),
  primary key (customer_user_id, promo_order_number)
);
alter table public.customer_fee_promotions enable row level security;
revoke all on public.customer_fee_promotions from public, anon, authenticated;
grant all on public.customer_fee_promotions to service_role;

alter table public.order_price_snapshots
  add column customer_fee_standard_bps integer check (customer_fee_standard_bps between 0 and 1000),
  add column customer_fee_discount_percent integer check (customer_fee_discount_percent between 0 and 100),
  add column customer_fee_promo_order_number smallint check (customer_fee_promo_order_number between 1 and 3);

create function public.customer_fee_quote(p_customer_user_id uuid)
returns table(effective_bps integer, standard_bps integer, discount_percent integer, remaining_discounted_orders integer)
language sql stable security invoker set search_path = '' as $$
  with used as (
    select count(*)::integer as value
    from public.customer_fee_promotions p
    join public.reservations r on r.id = p.reservation_id
    where p.customer_user_id = p_customer_user_id
      and (r.status in ('paid','refunded') or
        (r.status in ('pending_vendor_confirmation','payment_link_pending','payment_pending') and r.expires_at > now()))
  )
  select case when value < 3 then 50 else 100 end,
    100,
    case when value < 3 then 50 else 0 end,
    greatest(0, 3-value)
  from used;
$$;
revoke all on function public.customer_fee_quote(uuid) from public, anon, authenticated;
grant execute on function public.customer_fee_quote(uuid) to service_role;

create function public.assign_customer_fee_discount(p_reservation_id uuid, p_customer_user_id uuid)
returns table(effective_bps integer, standard_bps integer, discount_percent integer, promo_order_number smallint)
language plpgsql security invoker set search_path = '' as $$
declare v_order public.reservations; v_slot smallint;
begin
  select * into v_order from public.reservations where id = p_reservation_id for update;
  if not found or v_order.customer_user_id <> p_customer_user_id then raise exception 'reservation_not_owned'; end if;
  -- Serialize allocations for this customer, including simultaneous checkouts.
  perform 1 from public.profiles where id = p_customer_user_id for update;
  delete from public.customer_fee_promotions p using public.reservations r
    where p.reservation_id = r.id and p.customer_user_id = p_customer_user_id
      and (r.status in ('cancelled','expired','rejected_by_vendor') or
        (r.status in ('pending_vendor_confirmation','payment_link_pending','payment_pending') and r.expires_at <= clock_timestamp()));
  select p.promo_order_number into v_slot from public.customer_fee_promotions p where p.reservation_id = p_reservation_id;
  if v_slot is null then
    select s::smallint into v_slot from generate_series(1,3) s
      where not exists (select 1 from public.customer_fee_promotions p where p.customer_user_id=p_customer_user_id and p.promo_order_number=s)
      order by s limit 1;
    if v_slot is not null then
      insert into public.customer_fee_promotions(customer_user_id,promo_order_number,reservation_id)
      values (p_customer_user_id,v_slot,p_reservation_id);
    end if;
  end if;
  return query select case when v_slot is null then 100 else 50 end,
    100, case when v_slot is null then 0 else 50 end, v_slot;
end $$;
revoke all on function public.assign_customer_fee_discount(uuid,uuid) from public, anon, authenticated;
grant execute on function public.assign_customer_fee_discount(uuid,uuid) to service_role;

comment on table public.customer_fee_promotions is
  'Server-only allocation of the three 50%-off customer service-fee slots. Never exposed directly to clients.';
