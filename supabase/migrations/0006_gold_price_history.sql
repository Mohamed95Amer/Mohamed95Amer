-- Daily, public-safe history for long-range charts and analysis. Raw 10-second
-- ticks grow quickly; this view keeps one truthful OHLC-style row per recorded
-- day while preserving the underlying public RLS policy via security_invoker.
create or replace view public.gold_price_daily_history
with (security_invoker = true)
as
select
  fetched_at::date as recorded_on,
  min(fetched_at) as first_fetched_at,
  max(fetched_at) as last_fetched_at,
  count(*)::integer as tick_count,
  (array_agg(price_per_gram_24k_aed order by fetched_at asc))[1] as open_price_aed,
  max(price_per_gram_24k_aed) as high_price_aed,
  min(price_per_gram_24k_aed) as low_price_aed,
  (array_agg(price_per_gram_24k_aed order by fetched_at desc))[1] as close_price_aed,
  string_agg(distinct source, ', ' order by source) as sources
from public.gold_price_ticks
where status in ('ok', 'degraded')
  and price_per_gram_24k_aed is not null
group by fetched_at::date;

grant select on public.gold_price_daily_history to anon, authenticated;

comment on view public.gold_price_daily_history is
  'Daily aggregates of usable GoldHub-recorded 24K AED/gram price ticks.';
