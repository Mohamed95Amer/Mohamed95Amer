-- A vendor being approved does not automatically approve a payment
-- destination. Aani numbers and bank accounts are a separate fraud boundary:
-- any change returns the destination to pending until an admin reviews it.
alter table public.vendor_payment_settings
  add column destination_verification_status text not null default 'not_required',
  add column destination_submitted_at timestamptz,
  add column destination_verified_at timestamptz,
  add column destination_verified_by uuid references public.profiles(id) on delete set null,
  add column destination_review_note text;

alter table public.vendor_payment_settings
  add constraint vendor_payment_settings_destination_status_check
  check (destination_verification_status in ('not_required', 'pending', 'approved', 'rejected')),
  add constraint vendor_payment_settings_destination_note_check
  check (destination_review_note is null or length(destination_review_note) <= 500),
  add constraint vendor_payment_settings_destination_state_check
  check (
    (destination_verification_status = 'not_required' and not aani_enabled and not bank_transfer_enabled)
    or (destination_verification_status <> 'not_required' and (aani_enabled or bank_transfer_enabled))
  ),
  add constraint vendor_payment_settings_destination_reviewer_check
  check (
    (destination_verification_status in ('approved', 'rejected') and destination_verified_at is not null and destination_verified_by is not null)
    or (destination_verification_status in ('not_required', 'pending') and destination_verified_at is null and destination_verified_by is null)
  );

-- Existing direct-transfer destinations were never independently checked by
-- Get Gold, so they intentionally start pending instead of being grandfathered.
update public.vendor_payment_settings
set destination_verification_status = case
      when aani_enabled or bank_transfer_enabled then 'pending'
      else 'not_required'
    end,
    destination_submitted_at = case
      when aani_enabled or bank_transfer_enabled then coalesce(updated_at, now())
      else null
    end,
    destination_verified_at = null,
    destination_verified_by = null,
    destination_review_note = null;

comment on column public.vendor_payment_settings.destination_verification_status is
  'Separate admin review for the current Aani or bank destination. Destination changes reset this to pending.';
comment on column public.vendor_payment_settings.destination_verified_by is
  'Admin profile that reviewed the current destination; cleared whenever the destination changes.';

create function public.reset_payment_destination_verification()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  destination_changed boolean;
begin
  destination_changed := tg_op = 'INSERT'
    or old.aani_enabled is distinct from new.aani_enabled
    or old.aani_mobile is distinct from new.aani_mobile
    or old.bank_transfer_enabled is distinct from new.bank_transfer_enabled
    or old.bank_name is distinct from new.bank_name
    or old.beneficiary_name is distinct from new.beneficiary_name
    or old.iban is distinct from new.iban;

  if not new.aani_enabled and not new.bank_transfer_enabled then
    new.destination_verification_status := 'not_required';
    new.destination_submitted_at := null;
    new.destination_verified_at := null;
    new.destination_verified_by := null;
    new.destination_review_note := null;
  elsif destination_changed then
    new.destination_verification_status := 'pending';
    new.destination_submitted_at := clock_timestamp();
    new.destination_verified_at := null;
    new.destination_verified_by := null;
    new.destination_review_note := null;
  end if;

  return new;
end $$;

revoke all on function public.reset_payment_destination_verification() from public, anon, authenticated;

create trigger reset_payment_destination_verification_before_write
before insert or update on public.vendor_payment_settings
for each row execute function public.reset_payment_destination_verification();

create index vendor_payment_settings_destination_review_idx
  on public.vendor_payment_settings (destination_verification_status, destination_submitted_at desc)
  where destination_verification_status in ('pending', 'rejected');

notify pgrst, 'reload schema';
