alter table public.vendor_payment_settings
  add column cash_enabled boolean not null default true,
  add column card_enabled boolean not null default false,
  add column delivery_mode text not null default 'own_staff' check (delivery_mode in ('own_staff','external_courier')),
  add column courier_name text not null default '',
  add column delivery_fee_aed numeric(10,2) check (delivery_fee_aed between 0 and 60);
alter table public.reservations drop constraint reservations_payment_method_check;
alter table public.reservations add constraint reservations_payment_method_check check (payment_method in ('pay_at_store','pay_online','bank_transfer','cash','card'));
alter table public.reservations add column vendor_delivery_snapshot jsonb;

create function public.accept_vendor_offline_order(p_reservation_id uuid, p_vendor_user_id uuid, p_note text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_product_id uuid; v_order public.reservations;
begin
  select product_id into v_product_id from public.reservations where id=p_reservation_id;
  perform 1 from public.products where id=v_product_id for update;
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if not exists (select 1 from public.vendors where id=v_order.vendor_id and owner_user_id=p_vendor_user_id and verification_status='approved') then raise exception 'not_authorized'; end if;
  if v_order.payment_method not in ('cash','card') or v_order.status <> 'pending_vendor_confirmation'
    or v_order.expires_at <= clock_timestamp() then raise exception 'order_changed_or_expired'; end if;
  update public.reservations set status='payment_pending', payment_status='awaiting_store_confirmation',
    vendor_response_note=p_note, vendor_responded_at=clock_timestamp(), expires_at=clock_timestamp()+interval '24 hours'
    where id=p_reservation_id;
  return p_reservation_id;
end $$;
revoke all on function public.accept_vendor_offline_order(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_vendor_offline_order(uuid,uuid,text) to service_role;
