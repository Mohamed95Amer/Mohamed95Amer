-- UAE legal-market karats and transparent store-wide rate adjustments.
alter table public.products drop constraint if exists products_karat_check;
alter table public.products
  add constraint products_karat_check check (karat in (12, 14, 16, 18, 21, 22, 24));

alter table public.buyer_requests drop constraint if exists buyer_requests_karat_check;
alter table public.buyer_requests
  add constraint buyer_requests_karat_check check (karat in (12, 14, 16, 18, 21, 22, 24));

alter table public.products
  add column if not exists vendor_rate_adjustment_per_gram numeric(12,2) not null default 0
  check (vendor_rate_adjustment_per_gram between 0 and 1000);

alter table public.order_price_snapshots
  add column if not exists vendor_rate_adjustment_per_gram numeric(12,2) not null default 0
  check (vendor_rate_adjustment_per_gram between 0 and 1000),
  add column if not exists vendor_rate_adjustment_aed numeric(12,2) not null default 0
  check (vendor_rate_adjustment_aed >= 0);

comment on column public.products.vendor_rate_adjustment_per_gram is
  'Optional store-specific AED/g adjustment displayed separately from the making charge.';
comment on column public.order_price_snapshots.vendor_rate_adjustment_per_gram is
  'Locked store-specific AED/g adjustment used for this order snapshot.';
