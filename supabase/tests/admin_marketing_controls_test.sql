begin;
select plan(18);

select has_table('public', 'vendor_promotions', 'premium vendor placements table exists');
select has_table('public', 'site_banners', 'site banners table exists');
select has_table('public', 'marketplace_promotions', 'marketplace discount campaigns table exists');
select has_column('public', 'order_price_snapshots', 'marketplace_promotion_id', 'orders retain the campaign reference');
select has_column('public', 'order_price_snapshots', 'marketplace_promotion_title', 'orders retain the campaign name');
select has_column('public', 'order_price_snapshots', 'service_fee_event_discount_percent', 'orders retain the fee discount');
select has_column('public', 'order_price_snapshots', 'delivery_event_discount_percent', 'orders retain the delivery discount');
select has_column('public', 'order_price_snapshots', 'delivery_fee_before_event_discount', 'orders retain the delivery subsidy basis');

select ok((select relrowsecurity from pg_class where oid = 'public.vendor_promotions'::regclass), 'vendor promotions has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.site_banners'::regclass), 'site banners has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.marketplace_promotions'::regclass), 'marketplace promotions has RLS');

select is(has_table_privilege('anon', 'public.vendor_promotions', 'SELECT'), false, 'anonymous clients cannot enumerate promotion rewards');
select is(has_table_privilege('authenticated', 'public.site_banners', 'INSERT'), false, 'browser clients cannot forge banners');
select is(has_table_privilege('authenticated', 'public.marketplace_promotions', 'UPDATE'), false, 'browser clients cannot change marketplace discounts');
select is(has_table_privilege('service_role', 'public.vendor_promotions', 'INSERT'), true, 'service role can grant premium placement');
select is(has_table_privilege('service_role', 'public.site_banners', 'UPDATE'), true, 'service role can cancel banners');

select ok(exists (select 1 from storage.buckets where id = 'marketing-assets' and public and file_size_limit = 5242880), 'public marketing bucket has the five-megabyte limit');
select ok(exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'vendor_promotions_active_idx'), 'active premium placements are indexed');

select * from finish();
rollback;
