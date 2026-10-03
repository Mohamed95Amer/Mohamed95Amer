-- Vendor banking data is deliberately separate from publicly readable vendors.
create table public.vendor_payment_settings (
  vendor_id uuid primary key references public.vendors(id) on delete cascade,
  bank_transfer_enabled boolean not null default false,
  bank_name text not null default '',
  beneficiary_name text not null default '',
  iban text not null default '',
  updated_at timestamptz not null default now(),
  commission_active_from timestamptz,
  check (not bank_transfer_enabled or (length(bank_name) between 2 and 120 and length(beneficiary_name) between 2 and 200 and iban ~ '^AE[0-9]{21}$'))
);
alter table public.vendor_payment_settings enable row level security;
revoke all on public.vendor_payment_settings from public, anon, authenticated;
grant all on public.vendor_payment_settings to service_role;

alter table public.reservations drop constraint reservations_payment_method_check;
alter table public.reservations add constraint reservations_payment_method_check
  check (payment_method in ('pay_at_store','pay_online','bank_transfer'));
alter table public.reservations add column bank_details_snapshot jsonb;
alter table public.reservations add column transfer_proof_path text;
alter table public.reservations add column transfer_reference text;
alter table public.reservations add column transfer_submitted_at timestamptz;
alter table public.reservations add column payment_confirmed_at timestamptz;
alter table public.order_price_snapshots add column vendor_commission_basis text;
alter table public.order_price_snapshots add column vendor_commission_standard_aed numeric(12,2);
alter table public.order_price_snapshots add column vendor_commission_aed numeric(12,2);
comment on column public.vendor_payment_settings.commission_active_from is 'Admin-only activation after signed free period, incorporation and written rate notification. NULL means no commission charged.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('payment-proofs','payment-proofs',false,5242880,array['image/jpeg','image/png','application/pdf']);
-- No browser storage policy: authenticated server routes check order ownership.

create function public.confirm_vendor_bank_transfer(p_reservation_id uuid, p_vendor_user_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_product_id uuid; v_order public.reservations;
begin
  select product_id into v_product_id from public.reservations where id=p_reservation_id;
  -- Same lock order as claim_reservation; never revive a hold after stock was released.
  perform 1 from public.products where id=v_product_id for update;
  select * into v_order from public.reservations where id=p_reservation_id for update;
  if not exists (select 1 from public.vendors where id=v_order.vendor_id
      and owner_user_id=p_vendor_user_id and verification_status='approved') then
    raise exception 'not_authorized';
  end if;
  if v_order.payment_method <> 'bank_transfer' or v_order.status <> 'payment_pending'
      or v_order.expires_at <= clock_timestamp() or v_order.transfer_proof_path is null then
    raise exception 'order_changed_or_expired';
  end if;
  update public.reservations set status='paid', payment_status='paid', payment_confirmed_at=clock_timestamp()
    where id=p_reservation_id;
  return p_reservation_id;
end $$;
revoke all on function public.confirm_vendor_bank_transfer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_vendor_bank_transfer(uuid,uuid) to service_role;
