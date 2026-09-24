-- Index foreign-key columns used by joins and cascading maintenance. These are
-- deliberately separate from the payment-destination change for easy review.
create index if not exists order_identity_verifications_product_id_idx
  on public.order_identity_verifications (product_id);
create index if not exists order_price_snapshots_gold_tick_id_idx
  on public.order_price_snapshots (gold_tick_id);
create index if not exists reservations_payment_confirmed_by_idx
  on public.reservations (payment_confirmed_by);
create index if not exists reservations_payment_dispute_updated_by_idx
  on public.reservations (payment_dispute_updated_by);
create index if not exists reservations_product_id_idx
  on public.reservations (product_id);
