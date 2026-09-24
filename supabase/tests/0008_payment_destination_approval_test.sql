begin;
select plan(15);

insert into auth.users (id, email, raw_user_meta_data) values
  ('71000000-0000-4000-8000-000000000001', 'destination-vendor@example.invalid', '{"role":"vendor"}'),
  ('71000000-0000-4000-8000-000000000002', 'destination-admin@example.invalid', '{"role":"customer"}');
update public.profiles set role='admin' where id='71000000-0000-4000-8000-000000000002';

insert into public.vendors (
  id, owner_user_id, business_name, trade_license_number, license_expiry_date,
  owner_name, email, phone, emirate, store_address, verification_status
) values (
  '72000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'Destination Test Store', 'DESTINATION-TEST', current_date + 365,
  'Vendor Owner', 'destination-vendor@example.invalid', '+971500000000',
  'Dubai', 'Synthetic test address', 'approved'
);

insert into public.vendor_payment_settings (
  vendor_id, aani_enabled, aani_mobile, bank_transfer_enabled,
  bank_name, beneficiary_name, iban
) values (
  '72000000-0000-4000-8000-000000000001', true, '+971509081312', false,
  '', '', ''
);

select is(
  (select destination_verification_status from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'pending',
  'a new direct-transfer destination starts pending'
);
select ok(
  (select destination_submitted_at is not null from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'a pending destination records its submission time'
);

update public.vendor_payment_settings set
  destination_verification_status='approved',
  destination_verified_at=clock_timestamp(),
  destination_verified_by='71000000-0000-4000-8000-000000000002'
where vendor_id='72000000-0000-4000-8000-000000000001';
select is(
  (select destination_verification_status from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'approved',
  'an admin review can approve the current destination'
);

update public.vendor_payment_settings set delivery_fee_aed=15
where vendor_id='72000000-0000-4000-8000-000000000001';
select is(
  (select destination_verification_status from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'approved',
  'unrelated checkout changes preserve destination approval'
);

update public.vendor_payment_settings set aani_mobile='+971509081313'
where vendor_id='72000000-0000-4000-8000-000000000001';
select is(
  (select destination_verification_status from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'pending',
  'changing an Aani number revokes the prior approval'
);
select ok(
  (select destination_verified_at is null and destination_verified_by is null from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'a destination change clears the prior reviewer and timestamp'
);

update public.vendor_payment_settings set aani_enabled=false
where vendor_id='72000000-0000-4000-8000-000000000001';
select is(
  (select destination_verification_status from public.vendor_payment_settings where vendor_id='72000000-0000-4000-8000-000000000001'),
  'not_required',
  'disabling all direct transfers makes review unnecessary'
);

select ok(
  not has_table_privilege('authenticated', 'public.vendor_payment_settings', 'SELECT'),
  'browser clients cannot read private payment settings'
);
select ok(
  not has_function_privilege('authenticated', 'public.reset_payment_destination_verification()', 'EXECUTE'),
  'browser clients cannot call the destination reset trigger helper'
);
select has_index('public', 'order_identity_verifications', 'order_identity_verifications_product_id_idx', 'identity product foreign key is indexed');
select has_index('public', 'order_price_snapshots', 'order_price_snapshots_gold_tick_id_idx', 'price tick foreign key is indexed');
select has_index('public', 'reservations', 'reservations_payment_confirmed_by_idx', 'payment confirmer foreign key is indexed');
select has_index('public', 'reservations', 'reservations_payment_dispute_updated_by_idx', 'payment dispute actor foreign key is indexed');
select has_index('public', 'reservations', 'reservations_product_id_idx', 'reservation product foreign key is indexed');
select has_index('public', 'vendor_payment_settings', 'vendor_payment_settings_destination_verified_by_idx', 'destination reviewer foreign key is indexed');

select * from finish();
rollback;
