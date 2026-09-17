-- Applied to hosted Get Gold as migration 20260915131642.
-- Profile RLS calls is_admin(), which previously queried profiles through that
-- same RLS policy and recursively overflowed (including browser Storage uploads).
-- This narrowly scoped helper reads only the caller's role, never a supplied id.
-- It lives outside the exposed API schemas and uses a fixed empty search path.
create schema if not exists getgold_private;
revoke all on schema getgold_private from public;
grant usage on schema getgold_private to anon, authenticated, service_role;

create or replace function getgold_private.current_user_role()
returns public.user_role
language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select role from public.profiles where id = (select auth.uid())),
    'customer'::public.user_role
  );
$$;
revoke all on function getgold_private.current_user_role() from public;
grant execute on function getgold_private.current_user_role() to anon, authenticated, service_role;

create or replace function public.current_role()
returns public.user_role
language sql stable
set search_path = ''
as $$ select getgold_private.current_user_role(); $$;

-- Marketplace writes go through authenticated Next.js routes, which validate
-- ownership, approval, identity, payment transitions and locked prices before
-- using service_role. Legacy direct-client grants bypassed those checks.
-- Keep scoped SELECT for ownership-dependent Storage policies and account reads.
revoke insert, update, delete, truncate, references, trigger on table
  public.vendors, public.products, public.reservations,
  public.vendor_documents, public.order_price_snapshots, public.audit_logs,
  public.platform_settings, public.gold_price_ticks
from public, anon, authenticated;

-- Row policies cannot hide bank details, licence documents or internal notes.
-- Public catalogue pages already use explicit server-side projections; the raw
-- records are private. Retain vendor SELECT grants so browser Storage policies
-- can resolve the authenticated uploader's own vendor id.
drop policy if exists "vendors public read approved" on public.vendors;
drop policy if exists "vendors owner or admin read" on public.vendors;
create policy "vendors owner or admin read" on public.vendors
  for select to authenticated
  using (owner_user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "products public read approved" on public.products;
drop policy if exists "products owner or admin read" on public.products;
create policy "products owner or admin read" on public.products
  for select to authenticated
  using (
    (select public.is_admin())
    or vendor_id in (
      select id from public.vendors where owner_user_id = (select auth.uid())
    )
  );

-- Remove obsolete write policies as defense in depth against later re-grants.
-- In particular, an owner-only INSERT check did not prevent inserting an
-- already-approved store/listing, and the reservation UPDATE policy allowed
-- customers to rewrite payment status and order details directly.
drop policy if exists "vendors owner insert" on public.vendors;
drop policy if exists "vendors owner or admin update" on public.vendors;
drop policy if exists "vendors admin delete" on public.vendors;
drop policy if exists "products vendor insert" on public.products;
drop policy if exists "products vendor or admin update" on public.products;
drop policy if exists "products vendor or admin delete" on public.products;
drop policy if exists "reservations vendor respond" on public.reservations;
drop policy if exists "vendor_documents owner insert" on public.vendor_documents;
drop policy if exists "vendor_documents owner or admin delete" on public.vendor_documents;
drop policy if exists "platform_settings admin update" on public.platform_settings;

-- Gold price SELECT and Realtime, Storage policies, service_role access and
-- atomic claim_reservation() remain unchanged.
notify pgrst, 'reload schema';
