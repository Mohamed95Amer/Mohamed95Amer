begin;
select plan(7);

insert into auth.users (id, email, raw_user_meta_data) values
  ('61000000-0000-4000-8000-000000000001', 'message-customer@example.invalid', '{"role":"customer"}'),
  ('61000000-0000-4000-8000-000000000002', 'message-vendor@example.invalid', '{"role":"vendor"}'),
  ('61000000-0000-4000-8000-000000000003', 'message-outsider@example.invalid', '{"role":"customer"}');

insert into public.vendors (
  id, owner_user_id, business_name, trade_license_number, license_expiry_date,
  owner_name, email, phone, emirate, store_address, verification_status
) values (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000002',
  'Message Test Store', 'MESSAGE-TEST', current_date + 365,
  'Vendor Owner', 'message-vendor@example.invalid', '+971500000000',
  'Dubai', 'Synthetic test address', 'approved'
);

insert into public.products (
  id, vendor_id, name, description, category, karat, weight_grams,
  making_charge, quantity, images, hallmark_info, product_status
) values (
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  'Message test product', 'Synthetic order conversation fixture', 'ring', 22, 5,
  100, 1, '["test-only/message-product.jpg"]', 'Synthetic 22K hallmark', 'approved'
);

insert into public.reservations (
  id, customer_user_id, product_id, vendor_id, quantity, status, expires_at,
  payment_method, payment_status, fulfilment_method, vendor_confirmed_price_aed
) values (
  '64000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '63000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000001',
  1, 'payment_pending', now() + interval '30 minutes',
  'card', 'awaiting_customer_payment', 'collection', 2500
);

insert into public.order_messages (
  reservation_id, sender_user_id, sender_role, message_type, body, payment_url
) values
  ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000001', 'customer', 'text', 'Is this ready today?', null),
  ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000002', 'vendor', 'payment_link', 'Use this vendor payment page.', 'https://pay.example.com/order/test');

select ok(has_table_privilege('authenticated', 'public.order_messages', 'select'), 'authenticated users hold SELECT only where RLS permits');
select ok(not has_table_privilege('authenticated', 'public.order_messages', 'insert,update,delete'), 'authenticated users cannot write or alter messages directly');
select ok(not has_table_privilege('anon', 'public.order_messages', 'select'), 'signed-out visitors cannot read conversations');

set local role authenticated;
select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000001', true);
select results_eq(
  $$select count(*)::bigint from public.order_messages where reservation_id = '64000000-0000-4000-8000-000000000001'$$,
  array[2::bigint],
  'customer reads all messages on their own order'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$select count(*)::bigint from public.order_messages where reservation_id = '64000000-0000-4000-8000-000000000001'$$,
  array[2::bigint],
  'vendor owner reads all messages on the store order'
);

select set_config('request.jwt.claim.sub', '61000000-0000-4000-8000-000000000003', true);
select results_eq(
  $$select count(*)::bigint from public.order_messages where reservation_id = '64000000-0000-4000-8000-000000000001'$$,
  array[0::bigint],
  'an unrelated customer sees no messages'
);
select throws_ok(
  $$insert into public.order_messages (reservation_id, sender_user_id, sender_role, body)
    values ('64000000-0000-4000-8000-000000000001', '61000000-0000-4000-8000-000000000003', 'customer', 'forged')$$,
  '42501',
  null,
  'browser clients cannot bypass the validated message API'
);

select * from finish();
rollback;
