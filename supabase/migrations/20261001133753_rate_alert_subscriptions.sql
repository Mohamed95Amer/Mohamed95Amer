-- Public gold-rate alert sign-ups from /gold-rate pages. Visitors do not need an
-- account, so rows are written only by the server (service role) after
-- validation and rate limiting. Each row records consent and carries a random
-- token for one-click unsubscribe links.
create table if not exists public.rate_alert_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  whatsapp text check (whatsapp is null or whatsapp ~ '^\+?[0-9]{7,15}$'),
  karat smallint not null check (karat in (24, 22, 21, 18)),
  frequency text not null default 'daily' check (frequency in ('daily', 'target')),
  target_rate_aed numeric(10,2) check (target_rate_aed is null or target_rate_aed > 0),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  source_path text check (source_path is null or char_length(source_path) <= 200),
  consent_at timestamptz not null default now(),
  unsubscribe_token uuid not null unique default gen_random_uuid(),
  active boolean not null default true,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz,
  last_sent_rate_aed numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (email, karat),
  check (frequency = 'daily' or target_rate_aed is not null)
);

create index if not exists rate_alert_subscriptions_active_idx
  on public.rate_alert_subscriptions (karat, frequency) where active;

alter table public.rate_alert_subscriptions enable row level security;
revoke all on public.rate_alert_subscriptions from anon, authenticated;

comment on table public.rate_alert_subscriptions is
  'Consented gold-rate alert leads from public rate pages; server-only access.';
