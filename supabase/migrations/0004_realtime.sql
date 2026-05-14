-- Enable realtime for gold_price_ticks and products so the frontend can
-- subscribe to live price changes and product status changes.
alter publication supabase_realtime add table public.gold_price_ticks;
alter publication supabase_realtime add table public.products;
alter publication supabase_realtime add table public.reservations;
