alter table public.products
  add column if not exists vendor_margin_per_gram numeric(10, 2) not null default 0
  check (vendor_margin_per_gram >= 0);

alter table public.order_price_snapshots
  add column if not exists vendor_margin_per_gram numeric(10, 2) not null default 0
    check (vendor_margin_per_gram >= 0),
  add column if not exists vendor_margin_aed numeric(10, 2) not null default 0
    check (vendor_margin_aed >= 0);

comment on column public.products.vendor_margin_per_gram is
  'Vendor-selected addition in AED per gram of the product gold weight.';

comment on column public.order_price_snapshots.vendor_margin_per_gram is
  'Per-gram vendor margin captured when the reservation price was calculated.';

comment on column public.order_price_snapshots.vendor_margin_aed is
  'Total vendor margin in AED captured for the reservation price.';
