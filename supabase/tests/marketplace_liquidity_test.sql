begin;
select plan(12);

select has_column('public', 'products', 'inventory_confirmed_at', 'products records inventory freshness');
select has_column('public', 'products', 'data_quality_status', 'products records integrity status');
select has_column('public', 'reservations', 'payment_method', 'reservations records the payment choice');
select has_table('public', 'buyer_requests', 'buyer requests table exists');
select has_table('public', 'buyer_request_offers', 'buyer offers table exists');
select has_table('public', 'store_visit_requests', 'store visit table exists');
select has_table('public', 'catalogue_support_requests', 'catalogue support table exists');
select has_view('public', 'vendor_liquidity_summary', 'vendor liquidity view exists');

select is(
  public.product_integrity_issues(
    'Classic 22K Bangle', 'A hallmarked, hand-finished gold bangle.', 'bangle', 22,
    12.5, 2, 250, 0, 0, 'CERT-1', 'UAE Hallmark 22K', '["vendor/photo.jpg"]'::jsonb
  ),
  '[]'::jsonb,
  'a complete, internally consistent listing passes'
);

select ok(
  public.product_integrity_issues(
    '24K Gold Pendant', 'A detailed hallmarked pendant in polished gold.', 'pendant', 22,
    5, 1, 100, 0, 0, 'CERT-2', 'UAE Hallmark 22K', '["vendor/photo.jpg"]'::jsonb
  ) @> '[{"code":"KARAT_TITLE_MISMATCH"}]'::jsonb,
  'title purity contradictions are blocked'
);

select ok(
  public.product_integrity_issues(
    '1g 24K Gold Bar', 'A sealed investment gold bar with an assay fee.', 'bar', 24,
    1, 10, 0, 0, 25, null, null, '["vendor/bar.jpg"]'::jsonb
  ) @> '[{"code":"CERTIFICATE_REFERENCE_REQUIRED"},{"code":"BULLION_EVIDENCE_REQUIRED"}]'::jsonb,
  'bullion certificate fees require evidence'
);

select ok(
  public.product_integrity_issues(
    'Classic 22K Bangle', 'A hallmarked, hand-finished gold bangle.', 'bangle', 22,
    12.5, 2, 250, 0, 0, 'CERT-1', 'UAE Hallmark 22K', '{}'::jsonb
  ) @> '[{"code":"PHOTO_REQUIRED"}]'::jsonb,
  'malformed photo data fails closed without raising'
);

select * from finish();
rollback;
