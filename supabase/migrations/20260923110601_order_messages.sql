-- Private, order-scoped customer/vendor conversations. Messages are immutable;
-- authenticated clients may read only conversations they participate in, while
-- validated Next.js routes perform writes with the service role.

create table public.order_messages (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer', 'vendor')),
  message_type text not null default 'text' check (message_type in ('text', 'payment_link')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  payment_url text,
  created_at timestamptz not null default clock_timestamp(),
  constraint order_messages_payment_url_check check (
    (message_type = 'text' and payment_url is null)
    or
    (message_type = 'payment_link' and sender_role = 'vendor'
      and char_length(payment_url) <= 2000
      and payment_url ~ '^https://[^[:space:]]+$')
  )
);

create index order_messages_reservation_created_idx
  on public.order_messages (reservation_id, created_at desc, id desc);

alter table public.order_messages enable row level security;
revoke all on table public.order_messages from public, anon, authenticated;
grant select on table public.order_messages to authenticated;
grant select, insert on table public.order_messages to service_role;

create policy "order participants read messages"
on public.order_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.reservations r
    where r.id = order_messages.reservation_id
      and (
        r.customer_user_id = (select auth.uid())
        or exists (
          select 1 from public.vendors v
          where v.id = r.vendor_id
            and v.owner_user_id = (select auth.uid())
        )
        or (select public.is_admin())
      )
  )
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'order_messages'
  ) then
    alter publication supabase_realtime add table public.order_messages;
  end if;
end $$;

notify pgrst, 'reload schema';
