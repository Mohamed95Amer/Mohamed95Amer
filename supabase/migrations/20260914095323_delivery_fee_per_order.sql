-- Legacy snapshots retain their original per-unit delivery interpretation.
-- New application writes explicitly opt into per-order charging.
alter table public.order_price_snapshots
  add column delivery_fee_basis text not null default 'per_unit'
  check (delivery_fee_basis in ('per_unit', 'per_order'));

comment on column public.order_price_snapshots.delivery_fee_basis is
  'per_unit for legacy snapshots; per_order for new checkout. Never reinterpret historical totals.';
