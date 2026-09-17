-- Store percentage fees as basis points so pricing stays exact and auditable.
-- 50 basis points = 0.50%.
alter table public.platform_settings
  add column if not exists platform_fee_bps integer not null default 50
  check (platform_fee_bps between 0 and 1000);

-- Preserve the rate used for each immutable order price snapshot. Existing
-- snapshots used the legacy fixed-AED fee and therefore receive 0 bps.
alter table public.order_price_snapshots
  add column if not exists platform_fee_bps integer not null default 0
  check (platform_fee_bps between 0 and 1000);

update public.platform_settings
set platform_fee_bps = 50,
    platform_fee_aed = 0
where id = true;

comment on column public.platform_settings.platform_fee_bps is
  'GoldHub commission in basis points, calculated on merchandise before delivery. 50 = 0.50%.';

comment on column public.platform_settings.platform_fee_aed is
  'Deprecated fixed per-unit fee retained for backwards compatibility. Use platform_fee_bps.';

comment on column public.order_price_snapshots.platform_fee_bps is
  'Commission rate captured at reservation time. 50 = 0.50%.';
