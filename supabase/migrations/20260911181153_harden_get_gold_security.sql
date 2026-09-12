-- Resolve the security advisor's legacy warnings while preserving behaviour.
-- The live-price view is public data, but SECURITY INVOKER ensures it never
-- inherits the view owner's privileges if its underlying policy changes.
alter view public.gold_price_latest set (security_invoker = true);

create or replace function public.current_role()
returns public.user_role
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select role from public.profiles where id = (select auth.uid())),
    'customer'::public.user_role
  );
$$;

alter function public.is_admin() set search_path = '';
alter function public.touch_updated_at() set search_path = '';
alter function public.reserved_quantity(uuid) set search_path = '';
alter function public.available_quantity(uuid) set search_path = '';

-- Cache auth lookups once per statement rather than recalculating them for
-- every candidate profile row.
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read"
  on public.profiles
  for select
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles
  for update
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
