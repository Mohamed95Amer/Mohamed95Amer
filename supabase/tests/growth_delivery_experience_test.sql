begin;
select plan(20);

select has_table('public', 'user_preferences', 'user preferences table exists');
select has_table('public', 'notifications', 'notifications table exists');
select has_table('public', 'product_favourites', 'product favourites table exists');
select has_table('public', 'price_alerts', 'price alerts table exists');
select has_table('public', 'delivery_assignments', 'delivery assignments table exists');
select has_table('public', 'marketplace_events', 'privacy-minimal funnel events table exists');
select has_table('public', 'referral_codes', 'referral codes table exists');
select has_table('public', 'referral_attributions', 'referral attribution table exists');
select has_column('public', 'buyer_request_offers', 'product_id', 'buyer offers can link to ready inventory');
select has_column('public', 'products', 'search_document', 'products have a search document');

select ok((select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass), 'preferences has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.notifications'::regclass), 'notifications has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.product_favourites'::regclass), 'favourites has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.price_alerts'::regclass), 'price alerts has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.delivery_assignments'::regclass), 'delivery assignments has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.marketplace_events'::regclass), 'analytics events has RLS');

select is(
  has_table_privilege('anon', 'public.notifications', 'SELECT'),
  false,
  'anonymous users cannot read notifications directly'
);
select is(
  has_table_privilege('authenticated', 'public.delivery_assignments', 'SELECT'),
  false,
  'authenticated browser clients cannot enumerate courier assignments'
);
select is(
  has_table_privilege('authenticated', 'public.marketplace_events', 'INSERT'),
  false,
  'browser clients cannot forge analytics rows through the Data API'
);
select ok(
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'products_search_document_idx'),
  'product full-text search has a GIN index'
);

select * from finish();
rollback;
