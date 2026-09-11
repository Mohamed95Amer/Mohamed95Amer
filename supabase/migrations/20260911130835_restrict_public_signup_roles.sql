-- Signup metadata is controlled by the person creating the account. Never let
-- it assign privileged profile roles: public signup may request only customer
-- or vendor. Admin elevation remains a separate trusted operation.
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
    case
      when lower(coalesce(new.raw_user_meta_data->>'role', '')) = 'vendor'
        then 'vendor'::public.user_role
      else 'customer'::public.user_role
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- It is trigger-only. Removing API execution privileges reduces the exposed
-- surface while the auth.users trigger continues to execute as the owner.
revoke all on function public.handle_new_user() from public, anon, authenticated;
