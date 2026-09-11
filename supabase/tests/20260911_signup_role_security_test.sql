-- Regression test for public.handle_new_user().
-- Safe on production: every probe row is inside a transaction that rolls back.

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '99999999-9999-4999-8999-999999999901',
  'get-gold-admin-probe@example.invalid',
  jsonb_build_object('role', 'super_admin')
);

do $$
declare
  actual_role public.user_role;
begin
  select role into strict actual_role
  from public.profiles
  where id = '99999999-9999-4999-8999-999999999901';

  if actual_role <> 'customer'::public.user_role then
    raise exception 'crafted privileged role was not reduced to customer';
  end if;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '99999999-9999-4999-8999-999999999902',
  'get-gold-vendor-probe@example.invalid',
  jsonb_build_object('role', 'vendor')
);

do $$
declare
  actual_role public.user_role;
begin
  select role into strict actual_role
  from public.profiles
  where id = '99999999-9999-4999-8999-999999999902';

  if actual_role <> 'vendor'::public.user_role then
    raise exception 'vendor signup did not retain vendor role';
  end if;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '99999999-9999-4999-8999-999999999903',
  'get-gold-delivery-probe@example.invalid',
  jsonb_build_object('role', 'delivery_company')
);

do $$
declare
  actual_role public.user_role;
begin
  select role into strict actual_role
  from public.profiles
  where id = '99999999-9999-4999-8999-999999999903';

  if actual_role <> 'delivery_company'::public.user_role then
    raise exception 'delivery-company signup did not retain delivery_company role';
  end if;
end;
$$;

rollback;
