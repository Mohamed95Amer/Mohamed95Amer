-- Preserve the certified fineness of bullion separately from the catalogue karat label.
alter table public.products
  add column if not exists assay_fineness numeric(5,1)
  check (assay_fineness is null or assay_fineness between 500 and 1000);

alter table public.order_price_snapshots
  add column if not exists assay_fineness numeric(5,1)
  check (assay_fineness is null or assay_fineness between 500 and 1000);

comment on column public.products.assay_fineness is
  'Optional certificate fineness in parts per thousand, e.g. 995, 999 or 999.9; intended for bullion.';
comment on column public.order_price_snapshots.assay_fineness is
  'Certified fineness captured at the locked order price, when supplied for bullion.';
