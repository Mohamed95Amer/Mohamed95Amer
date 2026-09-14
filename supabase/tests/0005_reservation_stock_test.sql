-- ============================================================================
--  Verifies the stock accounting added in 0005_reservation_stock.sql.
--
--  Run with `npm run test:db` AFTER applying all migrations (pgTAP required).
--  Everything happens inside a
--  transaction that is rolled back at the end, so no test rows survive and it
--  is safe to run against a live project.
--
--  Success looks like NOTICEs ending in "ALL CHECKS PASSED" plus a pgTAP pass.
--  Any failure raises and aborts — psql/the SQL editor will show which check.
-- ============================================================================

begin;
select plan(1);

do $$
declare
  v_customer uuid;
  v_owner uuid;
  v_vendor uuid;
  v_product  uuid;
  v_qty      integer;
  v_res      public.reservations;
  v_avail    integer;
  v_refused  boolean;
  v_delivery public.reservations;
  v_check_claim uuid;
  v_check_oversell uuid;
  v_check_delivery uuid;
begin
  -- Hermetic fixtures: never depend on, reserve, or alter a real vendor's stock.
  v_customer := uuid_generate_v4();
  v_owner := uuid_generate_v4();
  v_vendor := uuid_generate_v4();
  v_product := uuid_generate_v4();
  v_qty := 3;
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_customer, v_customer || '@example.invalid', '{"role":"customer"}'),
    (v_owner, v_owner || '@example.invalid', '{"role":"vendor"}');
  insert into public.vendors (id, owner_user_id, business_name, trade_license_number,
    license_expiry_date, owner_name, email, phone, emirate, store_address, verification_status)
  values (v_vendor, v_owner, 'Synthetic stock test store', 'TEST-ONLY', current_date + 365,
    'Synthetic owner', v_owner || '@example.invalid', '+971500000000', 'Dubai', 'Test fixture address', 'approved');
  insert into public.products (id, vendor_id, name, description, category, karat,
    weight_grams, quantity, images, hallmark_info, product_status)
  values (v_product, v_vendor, 'Synthetic 22K Bangle', 'Synthetic fixture for stock-lock regression only.',
    'bangle', 22, 10, v_qty, '["test-only/bangle.jpg"]', 'Synthetic 22K hallmark', 'approved');

  raise notice 'fixture: product % with quantity %', v_product, v_qty;

  insert into public.order_identity_verifications (
    user_id, product_id, verification_route, provider_external_user_id,
    status, verified_at, expires_at
  ) values (
    v_customer, v_product, 'uae_resident', 'stock-test-' || uuid_generate_v4(),
    'approved', now(), now() + interval '30 minutes'
  ) returning id into v_check_claim;

  insert into public.order_identity_verifications (
    user_id, product_id, verification_route, provider_external_user_id,
    status, verified_at, expires_at
  ) values (
    v_customer, v_product, 'uae_resident', 'stock-test-' || uuid_generate_v4(),
    'approved', now(), now() + interval '30 minutes'
  ) returning id into v_check_oversell;

  insert into public.order_identity_verifications (
    user_id, product_id, verification_route, provider_external_user_id,
    status, verified_at, expires_at
  ) values (
    v_customer, v_product, 'visitor', 'stock-test-' || uuid_generate_v4(),
    'approved', now(), now() + interval '30 minutes'
  ) returning id into v_check_delivery;

  -- 1. Nothing reserved yet, so availability equals stock.
  select public.available_quantity(v_product) into v_avail;
  assert v_avail = v_qty,
    format('check 1: expected %s available, got %s', v_qty, v_avail);
  raise notice 'check 1 ok: availability starts at %', v_avail;

  -- 2. Claiming the entire stock succeeds and returns the row.
  select * into v_res
  from public.claim_reservation(
    p_customer_user_id => v_customer,
    p_product_id => v_product,
    p_quantity => v_qty,
    p_expires_at => now() + interval '10 minutes',
    p_identity_verification_id => v_check_claim
  );
  assert v_res.id is not null, 'check 2: claim_reservation returned no row';
  assert v_res.quantity = v_qty,
    format('check 2: expected quantity %s, got %s', v_qty, v_res.quantity);
  assert v_res.identity_verification_id = v_check_claim,
    'check 2: identity verification was not linked to reservation';
  raise notice 'check 2 ok: claimed % units, reservation %', v_qty, v_res.id;

  -- 3. That hold consumes all availability.
  select public.available_quantity(v_product) into v_avail;
  assert v_avail = 0, format('check 3: expected 0 available, got %s', v_avail);
  raise notice 'check 3 ok: availability now 0';

  -- 4. THE OVERSELL CHECK — one more unit must be refused.
  v_refused := false;
  begin
    perform public.claim_reservation(
      p_customer_user_id => v_customer,
      p_product_id => v_product,
      p_quantity => 1,
      p_expires_at => now() + interval '10 minutes',
      p_identity_verification_id => v_check_oversell
    );
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
    perform public.claim_reservation(
      p_customer_user_id => v_customer,
      p_product_id => v_product,
      p_quantity => 0,
      p_expires_at => now() + interval '10 minutes',
      p_identity_verification_id => v_check_oversell
    );
  exception when others then
    v_refused := true;
  end;
  assert v_refused, 'check 7: a quantity of 0 was accepted';
  raise notice 'check 7 ok: non-positive quantity rejected';

  -- Release the paid fixture so the fulfilment checks can claim one unit.
  update public.reservations set status = 'cancelled' where id = v_res.id;

  -- 8. A delivery order cannot be stored without an address and location pin.
  v_refused := false;
  begin
    perform public.claim_reservation(
      p_customer_user_id => v_customer,
      p_product_id => v_product,
      p_quantity => 1,
      p_expires_at => now() + interval '10 minutes',
      p_identity_verification_id => v_check_delivery,
      p_fulfilment_method => 'delivery'
    );
  exception when others then
    v_refused := true;
    assert sqlerrm like '%delivery_details_required%',
      format('check 8: refused for the wrong reason: %s', sqlerrm);
  end;
  assert v_refused, 'check 8: delivery without details was accepted';
  raise notice 'check 8 ok: incomplete delivery details rejected';

  -- 9. A complete delivery snapshot is saved by the same atomic stock claim.
  select * into v_delivery
  from public.claim_reservation(
    p_customer_user_id => v_customer,
    p_product_id => v_product,
    p_quantity => 1,
    p_expires_at => now() + interval '10 minutes',
    p_identity_verification_id => v_check_delivery,
    p_fulfilment_method => 'delivery',
    p_recipient_name => 'Test Customer',
    p_recipient_phone => '+971500000000',
    p_delivery_emirate => 'Dubai',
    p_delivery_area => 'Business Bay',
    p_delivery_address_line_1 => 'Test Tower, Test Street',
    p_delivery_latitude => 25.186000,
    p_delivery_longitude => 55.263000
  );
  assert v_delivery.id is not null, 'check 9: delivery claim returned no row';
  assert v_delivery.fulfilment_method = 'delivery', 'check 9: fulfilment method not persisted';
  assert v_delivery.delivery_area = 'Business Bay', 'check 9: delivery address not persisted';
  assert v_delivery.delivery_latitude = 25.186000, 'check 9: delivery pin not persisted';
  raise notice 'check 9 ok: delivery details and pin persisted atomically';

  -- 10. A successful identity result authorizes exactly one reservation.
  update public.reservations set status = 'cancelled' where id = v_delivery.id;
  v_refused := false;
  begin
    perform public.claim_reservation(
      p_customer_user_id => v_customer,
      p_product_id => v_product,
      p_quantity => 1,
      p_expires_at => now() + interval '10 minutes',
      p_identity_verification_id => v_check_delivery
    );
  exception when others then
    v_refused := true;
    assert sqlerrm like '%identity_verification_not_approved%'
      or sqlerrm like '%identity_verification_already_used%',
      format('check 10: reused identity refused for the wrong reason: %s', sqlerrm);
  end;
  assert v_refused, 'check 10: one identity check authorized two orders';
  raise notice 'check 10 ok: consumed identity result cannot be reused';

  -- 11. No new order can bypass the identity gate with a null check ID.
  v_refused := false;
  begin
    perform public.claim_reservation(
      p_customer_user_id => v_customer,
      p_product_id => v_product,
      p_quantity => 1,
      p_expires_at => now() + interval '10 minutes',
      p_identity_verification_id => null
    );
  exception when others then
    v_refused := true;
    assert sqlerrm like '%identity_verification_required%',
      format('check 11: null identity refused for the wrong reason: %s', sqlerrm);
  end;
  assert v_refused, 'check 11: order bypassed mandatory identity verification';
  raise notice 'check 11 ok: missing identity verification rejected';

  raise notice 'ALL CHECKS PASSED';
end $$;

select pass('all 11 atomic stock, fulfilment and single-use identity checks passed');
select * from finish();
rollback;
