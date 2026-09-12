-- ============================================================================
--  Seed data for local development.
--  Run AFTER you have created auth users for the placeholder owner ids below.
--  Replace the UUIDs with real auth.users ids from your Supabase project.
-- ============================================================================

-- Example: pretend these users already exist in auth.users
--   admin@goldhub.ae           -> a0000000-0000-0000-0000-000000000001
--   vendor1@example.ae         -> b0000000-0000-0000-0000-000000000001
--   vendor2@example.ae         -> b0000000-0000-0000-0000-000000000002
--   customer1@example.ae       -> c0000000-0000-0000-0000-000000000001

-- Promote the admin (requires the user row to already exist via profiles trigger)
-- update public.profiles set role = 'super_admin' where id = 'a0000000-0000-0000-0000-000000000001';

-- Two example vendors
insert into public.vendors (
  id, owner_user_id, business_name, trade_license_number, license_expiry_date,
  owner_name, email, phone, emirate, store_address, google_maps_link,
  vat_trn_number, verification_status
) values
  (
    '11111111-1111-1111-1111-111111111111',
    'b0000000-0000-0000-0000-000000000001',
    'Al Noor Jewellery LLC',
    'CN-1234567', '2027-12-31',
    'Ahmed Al Noor', 'sales@alnoor.example.ae', '+97150000001',
    'Dubai', 'Gold Souk, Deira, Dubai', 'https://maps.google.com/?q=Gold+Souk+Dubai',
    '100123456700003', 'approved'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-000000000002',
    'Pearl Gold Trading',
    'CN-7654321', '2026-08-15',
    'Fatima Hassan', 'hello@pearlgold.example.ae', '+97150000002',
    'Abu Dhabi', 'Madinat Zayed Gold Market, Abu Dhabi', null,
    null, 'approved'
  )
on conflict (id) do nothing;

-- Approved products
insert into public.products (
  id, vendor_id, name, description, category, karat, weight_grams,
  making_charge, making_charge_discount_percent, making_charge_offer_ends_at,
  certificate_fee, stone_value, vendor_premium, quantity, images,
  certificate_number, hallmark_info, product_status
) values
  (
    '33333333-3333-3333-3333-333333333301',
    '11111111-1111-1111-1111-111111111111',
    'Classic 22K Bangle',
    'Hand-finished classic bangle, hallmarked.',
    'bangle', 22, 12.500, 250.00, 20, null, 0, 0, 50.00, 3,
    '[]'::jsonb, 'DGCX-22K-AAA-001', 'UAE Hallmark 22K', 'approved'
  ),
  (
    '33333333-3333-3333-3333-333333333302',
    '11111111-1111-1111-1111-111111111111',
    '21K Twisted Chain 45cm',
    'Light twisted-link chain, 21 karat.',
    'chain', 21, 7.200, 180.00, 100, '2026-10-11 23:59:59+04', 0, 0, 30.00, 5,
    '[]'::jsonb, 'DGCX-21K-AAA-014', 'UAE Hallmark 21K', 'approved'
  ),
  (
    '33333333-3333-3333-3333-333333333303',
    '22222222-2222-2222-2222-222222222222',
    'Pearl Solitaire 18K Ring',
    'Akoya pearl with 18K white gold band.',
    'ring', 18, 3.400, 320.00, 0, null, 0, 450.00, 75.00, 2,
    '[]'::jsonb, 'GIA-PEARL-2024-AB', 'UAE Hallmark 18K', 'approved'
  ),
  (
    '33333333-3333-3333-3333-333333333304',
    '22222222-2222-2222-2222-222222222222',
    '1g 24K Gold Bar',
    'Investment-grade 1g 24K bar, sealed with assay.',
    'bar', 24, 1.000, 0, 0, null, 25.00, 0, 0, 20,
    '[]'::jsonb, 'PAMP-2024-001', '999.9 Fine', 'approved'
  )
on conflict (id) do nothing;

-- An initial fallback gold price tick so the UI has something to show
-- before the cron starts running.
insert into public.gold_price_ticks (source, xau_usd, usd_aed, price_per_gram_24k_aed, status)
values ('seed', 2350.0000, 3.672500, 277.4900, 'ok');
