-- Rotating landing-page media and auditable UAE VAT snapshots.
-- Existing orders retain their historical totals: snapshot VAT defaults to zero,
-- while every newly priced product defaults to the UAE standard 5% rate.

alter table public.products
  add column vat_rate_bps integer not null default 500
  check (vat_rate_bps in (0, 500));

comment on column public.products.vat_rate_bps is
  'VAT rate for this product in basis points. Use 0 only after confirming the item qualifies for UAE zero-rating; ordinary jewellery remains 500 (5%).';

alter table public.order_price_snapshots
  add column vat_rate_bps integer not null default 0
    check (vat_rate_bps in (0, 500)),
  add column vat_taxable_amount_aed numeric(14,2) not null default 0
    check (vat_taxable_amount_aed >= 0),
  add column vat_aed numeric(14,2) not null default 0
    check (vat_aed >= 0);

comment on column public.order_price_snapshots.vat_aed is
  'Order-level VAT locked with the price snapshot. Historical rows remain zero and are never retroactively repriced.';

alter table public.site_banners
  add column media_type text not null default 'image'
  check (media_type in ('image', 'video'));

comment on column public.site_banners.media_type is
  'How image_path is rendered. The legacy column name is retained to avoid rewriting existing banner records.';

update storage.buckets
set file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'video/mp4', 'video/webm'
    ]
where id = 'marketing-assets';
