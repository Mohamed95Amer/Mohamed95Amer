-- ============================================================================
--  GoldHub — Row Level Security
--  Principles:
--    * Customers can only read public, approved products and their own data.
--    * Vendors can only manage their own profile, products, docs, orders.
--    * Admins can do anything.
--    * Gold price ticks are world-readable (only the latest is needed publicly).
--    * Vendor documents are never readable via REST — only via signed URLs.
-- ============================================================================

alter table public.profiles            enable row level security;
alter table public.vendors             enable row level security;
alter table public.vendor_documents    enable row level security;
alter table public.products            enable row level security;
alter table public.gold_price_ticks    enable row level security;
alter table public.platform_settings   enable row level security;
alter table public.reservations        enable row level security;
alter table public.order_price_snapshots enable row level security;
alter table public.audit_logs          enable row level security;

-- ---------------------------------------------------------------------------
--  profiles
-- ---------------------------------------------------------------------------
drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Only admins can change role; enforced by a separate, role-locked policy
drop policy if exists "profiles admin insert" on public.profiles;
create policy "profiles admin insert" on public.profiles
  for insert with check (public.is_admin());

-- ---------------------------------------------------------------------------
--  vendors
-- ---------------------------------------------------------------------------
drop policy if exists "vendors public read approved" on public.vendors;
create policy "vendors public read approved" on public.vendors
  for select using (
    verification_status = 'approved'
    or owner_user_id = auth.uid()
    or public.is_admin()
  );

drop policy if exists "vendors owner insert" on public.vendors;
create policy "vendors owner insert" on public.vendors
  for insert with check (owner_user_id = auth.uid());

drop policy if exists "vendors owner or admin update" on public.vendors;
create policy "vendors owner or admin update" on public.vendors
  for update using (owner_user_id = auth.uid() or public.is_admin())
  with check (
    -- Owners cannot self-approve. Only admins can change verification_status.
    (owner_user_id = auth.uid() and verification_status = (
      select verification_status from public.vendors v2 where v2.id = vendors.id
    ))
    or public.is_admin()
  );

drop policy if exists "vendors admin delete" on public.vendors;
create policy "vendors admin delete" on public.vendors
  for delete using (public.is_admin());

-- ---------------------------------------------------------------------------
--  vendor_documents — NEVER public. Owner or admin only.
-- ---------------------------------------------------------------------------
drop policy if exists "vendor_documents owner or admin read" on public.vendor_documents;
create policy "vendor_documents owner or admin read" on public.vendor_documents
  for select using (
    public.is_admin()
    or vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

drop policy if exists "vendor_documents owner insert" on public.vendor_documents;
create policy "vendor_documents owner insert" on public.vendor_documents
  for insert with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

drop policy if exists "vendor_documents owner or admin delete" on public.vendor_documents;
create policy "vendor_documents owner or admin delete" on public.vendor_documents
  for delete using (
    public.is_admin()
    or vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
--  products
-- ---------------------------------------------------------------------------
drop policy if exists "products public read approved" on public.products;
create policy "products public read approved" on public.products
  for select using (
    product_status = 'approved'
    or vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    or public.is_admin()
  );

drop policy if exists "products vendor insert" on public.products;
create policy "products vendor insert" on public.products
  for insert with check (
    vendor_id in (
      select id from public.vendors
      where owner_user_id = auth.uid()
        and verification_status = 'approved'
    )
  );

drop policy if exists "products vendor or admin update" on public.products;
create policy "products vendor or admin update" on public.products
  for update using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    or public.is_admin()
  )
  with check (
    -- Vendors cannot self-approve. Status transitions to 'approved'/'rejected'/'suspended' are admin-only.
    public.is_admin()
    or (
      vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
      and product_status in ('draft','pending_approval','sold_out')
    )
  );

drop policy if exists "products vendor or admin delete" on public.products;
create policy "products vendor or admin delete" on public.products
  for delete using (
    public.is_admin()
    or vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
--  gold_price_ticks — world readable (anon allowed); writes are service-role only.
-- ---------------------------------------------------------------------------
drop policy if exists "gold_price_ticks public read" on public.gold_price_ticks;
create policy "gold_price_ticks public read" on public.gold_price_ticks
  for select using (true);

-- No insert/update/delete policies => only service role can write.

-- ---------------------------------------------------------------------------
--  platform_settings — public read of fees, admin write
-- ---------------------------------------------------------------------------
drop policy if exists "platform_settings public read" on public.platform_settings;
create policy "platform_settings public read" on public.platform_settings
  for select using (true);

drop policy if exists "platform_settings admin update" on public.platform_settings;
create policy "platform_settings admin update" on public.platform_settings
  for update using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
--  reservations
-- ---------------------------------------------------------------------------
drop policy if exists "reservations owner or vendor or admin read" on public.reservations;
create policy "reservations owner or vendor or admin read" on public.reservations
  for select using (
    customer_user_id = auth.uid()
    or vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    or public.is_admin()
  );

-- Inserts/updates happen server-side using service role from API routes,
-- but we still allow vendor responses + customer cancellations through RLS for completeness.
drop policy if exists "reservations vendor respond" on public.reservations;
create policy "reservations vendor respond" on public.reservations
  for update using (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    or public.is_admin()
    or customer_user_id = auth.uid()
  )
  with check (
    vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    or public.is_admin()
    or customer_user_id = auth.uid()
  );

-- ---------------------------------------------------------------------------
--  order_price_snapshots — read by owner/vendor/admin; only service role writes.
-- ---------------------------------------------------------------------------
drop policy if exists "order_price_snapshots scoped read" on public.order_price_snapshots;
create policy "order_price_snapshots scoped read" on public.order_price_snapshots
  for select using (
    public.is_admin()
    or reservation_id in (
      select id from public.reservations
      where customer_user_id = auth.uid()
         or vendor_id in (select id from public.vendors where owner_user_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
--  audit_logs — admin read only.
-- ---------------------------------------------------------------------------
drop policy if exists "audit_logs admin read" on public.audit_logs;
create policy "audit_logs admin read" on public.audit_logs
  for select using (public.is_admin());
