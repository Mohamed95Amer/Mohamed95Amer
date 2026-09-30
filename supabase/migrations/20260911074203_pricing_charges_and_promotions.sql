-- Keep bullion certification costs separate from jewellery workmanship, and
-- make promotions explicit so only the making component can be discounted.
alter table public.products
  add column if not exists certificate_fee numeric(12,2) not null default 0
    check (certificate_fee >= 0),
  add column if not exists making_charge_discount_percent integer not null default 0
    check (making_charge_discount_percent between 0 and 100),
  add column if not exists making_charge_offer_ends_at timestamptz;

-- Preserve the exact promotion and certification charge used for each locked
-- price. The existing making_charge snapshot remains the effective charge.
alter table public.order_price_snapshots
  add column if not exists certificate_fee numeric(12,2) not null default 0
    check (certificate_fee >= 0),
  add column if not exists original_making_charge numeric(12,2) not null default 0
    check (original_making_charge >= 0),
  add column if not exists making_charge_discount_percent integer not null default 0
    check (making_charge_discount_percent between 0 and 100),
  add column if not exists making_charge_offer_ends_at timestamptz;

update public.order_price_snapshots
set original_making_charge = making_charge
where original_making_charge = 0
  and making_charge > 0;

-- Bullion bars have assay/certificate costs rather than jewellery making.
update public.products
set certificate_fee = making_charge,
    making_charge = 0
where id in (
  '33333333-3333-3333-3333-333333333304',
  '33333333-3333-3333-3333-333333333311'
)
  and certificate_fee = 0
  and making_charge > 0;

-- A minted coin carries a mint premium, not a making charge.
update public.products
set vendor_premium = vendor_premium + making_charge,
    making_charge = 0
where id = '33333333-3333-3333-3333-333333333309'
  and making_charge > 0;

-- Demo promotions: one ordinary discount and one time-limited free-making
-- offer. Gold value, certificates, premiums and delivery are never discounted.
update public.products
set making_charge_discount_percent = 20,
    making_charge_offer_ends_at = null
where id = '33333333-3333-3333-3333-333333333301';

update public.products
set making_charge_discount_percent = 100,
    making_charge_offer_ends_at = '2026-10-11 23:59:59+04'
where id = '33333333-3333-3333-3333-333333333302';

comment on column public.products.certificate_fee is
  'Per-item certificate or bullion assay fee, separate from making charge.';

comment on column public.products.making_charge_discount_percent is
  'Percentage discount applied only to making_charge while the offer is active.';

comment on column public.products.making_charge_offer_ends_at is
  'Optional end time for the making-charge promotion. Null means no scheduled end.';
