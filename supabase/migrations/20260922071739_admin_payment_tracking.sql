-- Auditable payment tracking for vendor-direct Aani and bank transfers.
-- Customer evidence is only a submission claim; cleared funds remain a vendor
-- confirmation, and disputes are controlled by authenticated Get Gold admins.

alter table public.reservations
  add column if not exists payment_window_expires_at timestamptz,
  add column if not exists payment_confirmed_by uuid references public.profiles(id) on delete set null,
  add column if not exists payment_dispute_status text not null default 'none',
  add column if not exists payment_dispute_note text,
  add column if not exists payment_dispute_resolution_note text,
  add column if not exists payment_disputed_at timestamptz,
  add column if not exists payment_dispute_resolved_at timestamptz,
  add column if not exists payment_dispute_updated_by uuid references public.profiles(id) on delete set null;

alter table public.reservations
  drop constraint if exists reservations_payment_dispute_status_check;
alter table public.reservations
  add constraint reservations_payment_dispute_status_check
  check (payment_dispute_status in ('none', 'reported', 'resolved'));

create index if not exists reservations_payment_disputes_idx
  on public.reservations (payment_dispute_status, payment_disputed_at desc)
  where payment_dispute_status <> 'none';

comment on column public.reservations.payment_window_expires_at is
  'Immutable deadline originally granted after the customer accepted the vendor-confirmed price.';
comment on column public.reservations.payment_confirmed_by is
  'Vendor user who attested that cleared funds were visible in the vendor account.';
comment on column public.reservations.payment_dispute_status is
  'Admin-managed operational dispute marker; it never proves or reverses payment by itself.';

-- Preserve the original deadline before later states extend expires_at for
-- vendor verification or fulfilment.
create or replace function public.capture_payment_window_deadline()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'payment_pending'
    and old.status is distinct from 'payment_pending'
    and new.payment_window_expires_at is null then
    new.payment_window_expires_at := new.expires_at;
  end if;
  return new;
end $$;

revoke all on function public.capture_payment_window_deadline() from public, anon, authenticated;
grant execute on function public.capture_payment_window_deadline() to service_role;

drop trigger if exists reservations_capture_payment_window_deadline on public.reservations;
create trigger reservations_capture_payment_window_deadline
before update on public.reservations
for each row execute function public.capture_payment_window_deadline();

-- Backfill the deterministic original window where possible.
update public.reservations
set payment_window_expires_at = payment_window_started_at +
  case when payment_method in ('aani', 'bank_transfer', 'pay_online')
    then interval '30 minutes' else interval '24 hours' end
where payment_window_started_at is not null
  and payment_window_expires_at is null;

-- Attribute historical confirmations from the immutable audit trail when an
-- actor was recorded.
update public.reservations r
set payment_confirmed_by = (
  select a.actor_user_id
  from public.audit_logs a
  where a.entity_type = 'reservation'
    and a.entity_id = r.id::text
    and a.action = 'reservation.confirm_payment_received'
  order by a.created_at desc
  limit 1
)
where r.payment_confirmed_at is not null
  and r.payment_confirmed_by is null
  and exists (
    select 1 from public.audit_logs a
    where a.entity_type = 'reservation'
      and a.entity_id = r.id::text
      and a.action = 'reservation.confirm_payment_received'
      and a.actor_user_id is not null
  );

create or replace function public.confirm_vendor_direct_payment(
  p_reservation_id uuid,
  p_vendor_user_id uuid
)
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
    payment_confirmed_at=clock_timestamp(), payment_confirmed_by=p_vendor_user_id,
    expires_at=clock_timestamp()+interval '30 days'
  where id=p_reservation_id;
  return p_reservation_id;
end $$;

revoke all on function public.confirm_vendor_direct_payment(uuid,uuid) from public,anon,authenticated;
grant execute on function public.confirm_vendor_direct_payment(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
