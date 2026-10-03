create function public.accept_vendor_bank_transfer(p_reservation_id uuid, p_vendor_user_id uuid, p_note text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_product_id uuid; v_order public.reservations;
begin
  select product_id into v_product_id from public.reservations where id=p_reservation_id;
  perform 1 from public.products where id=v_product_id for update;
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if not exists (select 1 from public.vendors where id=v_order.vendor_id and owner_user_id=p_vendor_user_id and verification_status='approved') then raise exception 'not_authorized'; end if;
  if v_order.payment_method <> 'bank_transfer' or v_order.status <> 'pending_vendor_confirmation'
    or v_order.expires_at <= clock_timestamp() then raise exception 'order_changed_or_expired'; end if;
  update public.reservations set status='payment_pending', payment_status='awaiting_store_confirmation',
    vendor_response_note=p_note, vendor_responded_at=clock_timestamp(), expires_at=clock_timestamp()+interval '30 minutes'
    where id=p_reservation_id;
  return p_reservation_id;
end $$;
revoke all on function public.accept_vendor_bank_transfer(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_vendor_bank_transfer(uuid,uuid,text) to service_role;
