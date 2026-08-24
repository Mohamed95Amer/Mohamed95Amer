-- ============================================================================
--  Verifies the stock accounting added in 0005_reservation_stock.sql.
--
--  Run this AFTER applying that migration. Everything happens inside a
--  transaction that is rolled back at the end, so no test rows survive and it
--  is safe to run against a live project.
--
--  Success looks like a series of NOTICEs ending in "ALL CHECKS PASSED".
--  Any failure raises and aborts — psql/the SQL editor will show which check.
-- ============================================================================

begin;

do $$
declare
  v_customer uuid;
  v_product  uuid;
  v_qty      integer;
  v_res      public.reservations;
  v_avail    integer;
  v_refused  boolean;
begin
  -- Pick fixtures from whatever the environment already has, so this works
  -- against seeded and real data alike.
  select id into v_customer from public.profiles limit 1;
  if v_customer is null then
    raise exception 'no rows in public.profiles to test with';
  end if;

  -- quantity > 0 matters: a zero-stock product would make check 2 claim zero
  -- units and trip the invalid_quantity guard instead of testing what we want.
  select id, quantity into v_product, v_qty
  from public.products
  where product_status = 'approved'
    and quantity > 0
  order by created_at
  limit 1;
  if v_product is null then
    raise exception 'no approved product with stock to test with';
  end if;

  raise notice 'fixture: product % with quantity %', v_product, v_qty;

  -- 1. Nothing reserved yet, so availability equals stock.
  select public.available_quantity(v_product) into v_avail;
  assert v_avail = v_qty,
    format('check 1: expected %s available, got %s', v_qty, v_avail);
  raise notice 'check 1 ok: availability starts at %', v_avail;

  -- 2. Claiming the entire stock succeeds and returns the row.
  select * into v_res
  from public.claim_reservation(v_customer, v_product, v_qty, now() + interval '10 minutes');
  assert v_res.id is not null, 'check 2: claim_reservation returned no row';
  assert v_res.quantity = v_qty,
    format('check 2: expected quantity %s, got %s', v_qty, v_res.quantity);
  raise notice 'check 2 ok: claimed % units, reservation %', v_qty, v_res.id;

  -- 3. That hold consumes all availability.
  select public.available_quantity(v_product) into v_avail;
  assert v_avail = 0, format('check 3: expected 0 available, got %s', v_avail);
  raise notice 'check 3 ok: availability now 0';

  -- 4. THE OVERSELL CHECK — one more unit must be refused.
  v_refused := false;
  begin
    perform public.claim_reservation(v_customer, v_product, 1, now() + interval '10 minutes');
  exception when others then
    v_refused := true;
    assert sqlerrm like '%insufficient_stock%',
      format('check 4: refused for the wrong reason: %s', sqlerrm);
  end;
  assert v_refused, 'check 4: OVERSELL — a claim succeeded against zero stock';
  raise notice 'check 4 ok: oversell refused with insufficient_stock';

  -- 5. An expired hold releases its stock without any compensating write.
  update public.reservations
  set expires_at = now() - interval '1 minute'
  where id = v_res.id;
  select public.available_quantity(v_product) into v_avail;
  assert v_avail = v_qty,
    format('check 5: expired hold did not release stock, available %s', v_avail);
  raise notice 'check 5 ok: expired hold released % units', v_qty;

  -- 6. A paid hold consumes stock permanently, expiry notwithstanding.
  update public.reservations
  set status = 'paid'
  where id = v_res.id;
  select public.available_quantity(v_product) into v_avail;
  assert v_avail = 0,
    format('check 6: paid hold should still consume stock, available %s', v_avail);
  raise notice 'check 6 ok: paid hold still consumes stock';

  -- 7. Non-positive quantities are rejected.
  v_refused := false;
  begin
    perform public.claim_reservation(v_customer, v_product, 0, now() + interval '10 minutes');
  exception when others then
    v_refused := true;
  end;
  assert v_refused, 'check 7: a quantity of 0 was accepted';
  raise notice 'check 7 ok: non-positive quantity rejected';

  raise notice 'ALL CHECKS PASSED';
end $$;

rollback;
