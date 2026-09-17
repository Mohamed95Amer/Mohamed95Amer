-- Rebrand-era identity model: every authenticated person keeps one personal
-- profile, while vendors and delivery companies have a separate verified
-- business profile owned by that person.

create table if not exists public.delivery_companies (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null unique references public.profiles(id) on delete cascade,
  company_name text not null check (char_length(company_name) between 2 and 200),
  trade_license_number text not null unique check (char_length(trade_license_number) between 3 and 60),
  license_expiry_date date not null,
  contact_name text not null check (char_length(contact_name) between 2 and 120),
  email text not null,
  phone text not null,
  emirates_served text[] not null default '{}',
  service_notes text,
  website text,
  verification_status public.verification_status not null default 'pending',
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_companies_emirates_check check (
    cardinality(emirates_served) between 1 and 7
    and emirates_served <@ array[
      'Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain',
      'Ras Al Khaimah', 'Fujairah'
    ]::text[]
  )
);

create index if not exists delivery_companies_status_idx
  on public.delivery_companies (verification_status);

alter table public.delivery_companies enable row level security;

drop policy if exists "delivery companies owner or admin read" on public.delivery_companies;
create policy "delivery companies owner or admin read"
  on public.delivery_companies
  for select
  to authenticated
  using ((select auth.uid()) = owner_user_id or (select public.is_admin()));

-- Business-profile writes go through authenticated server routes that validate
-- every field and use the service role. Browser clients may only read their own
-- record, so they cannot approve themselves or change admin notes.
revoke all on table public.delivery_companies from anon, authenticated;
grant select on table public.delivery_companies to authenticated;

drop trigger if exists touch_delivery_companies on public.delivery_companies;
create trigger touch_delivery_companies
before update on public.delivery_companies
for each row execute function public.touch_updated_at();

-- raw_user_meta_data is controlled by the person signing up. Delivery company
-- and vendor are non-privileged onboarding paths; all other values, including
-- admin and super_admin, are reduced to customer.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'phone', ''),
    case lower(coalesce(new.raw_user_meta_data->>'role', ''))
      when 'vendor' then 'vendor'::public.user_role
      when 'delivery_company' then 'delivery_company'::public.user_role
      else 'customer'::public.user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- The original self-update policy checked only row ownership and therefore did
-- not stop a client from changing profiles.role. Limit direct browser updates
-- to personal contact fields; trusted admin operations continue through the
-- service role.
revoke update on table public.profiles from anon, authenticated;
grant update (full_name, phone) on table public.profiles to authenticated;

comment on table public.delivery_companies is
  'Private verified business profiles for Get Gold delivery partners.';
