-- Admin-owned campaigns and commission reconciliation. No customer money is moved.
-- Timestamp matches the applied production migration.
create table public.notification_campaigns (
 id uuid primary key default gen_random_uuid(),
 title text not null check (char_length(title) between 2 and 120),
 body text not null check (char_length(body) between 2 and 600),
 title_ar text, body_ar text,
 href text not null default '/marketplace' check ((href = '/' or href ~ '^/[^/]') and href !~ '[\\[:cntrl:]]'),
 audience text not null check (audience in ('customers','buyers','new_customers')),
 starts_at timestamptz not null, ends_at timestamptz not null,
 published_at timestamptz, cancelled_at timestamptz,
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check (ends_at > starts_at and ends_at <= starts_at + interval '90 days')
);
create index notification_campaigns_window_idx on public.notification_campaigns (ends_at, starts_at)
 where published_at is not null and cancelled_at is null;
create index notification_campaigns_creator_idx on public.notification_campaigns(created_by);
create table public.notification_campaign_reads (
 campaign_id uuid not null references public.notification_campaigns(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(), primary key(campaign_id,user_id)
);
create index notification_campaign_reads_user_idx on public.notification_campaign_reads(user_id);
create table public.commission_ledger (
 id uuid primary key default gen_random_uuid(),
 vendor_id uuid not null references public.vendors(id),
 kind text not null check(kind in ('receipt','credit','debit')),
 amount_aed numeric(14,2) not null check(amount_aed > 0 and amount_aed <= 10000000),
 note text not null check(char_length(note) between 5 and 500),
 reference text check(char_length(reference) <= 120),
 created_by uuid references public.profiles(id) on delete set null,
 created_at timestamptz not null default now(),
 voided_at timestamptz, void_reason text, voided_by uuid references public.profiles(id) on delete set null
);
create index commission_ledger_vendor_idx on public.commission_ledger(vendor_id,created_at desc);
create index commission_ledger_creator_idx on public.commission_ledger(created_by);
create index commission_ledger_voider_idx on public.commission_ledger(voided_by);
alter table public.notification_campaigns enable row level security;
alter table public.notification_campaign_reads enable row level security;
alter table public.commission_ledger enable row level security;
revoke all on public.notification_campaigns, public.notification_campaign_reads, public.commission_ledger from public,anon,authenticated,service_role;
grant select,insert,update on public.notification_campaigns, public.commission_ledger to service_role;
grant select,insert on public.notification_campaign_reads to service_role;

create function public.customer_campaign_inbox(p_user_id uuid)
returns table(id uuid,title text,body text,title_ar text,body_ar text,href text,starts_at timestamptz,ends_at timestamptz,read_at timestamptz)
language sql stable security invoker set search_path = '' as $$
 select c.id,c.title,c.body,c.title_ar,c.body_ar,c.href,c.starts_at,c.ends_at,r.read_at
 from public.notification_campaigns c
 join public.profiles p on p.id=p_user_id and p.role='customer'
 join public.user_preferences pref on pref.user_id=p.id and pref.marketing_notifications
 left join public.notification_campaign_reads r on r.campaign_id=c.id and r.user_id=p.id
 where c.published_at is not null and c.cancelled_at is null and c.starts_at<=now() and c.ends_at>now()
 and (c.audience='customers' or
  (c.audience='buyers' and exists(select 1 from public.reservations o where o.customer_user_id=p.id and o.payment_status='paid' and not o.is_demo)) or
  (c.audience='new_customers' and not exists(select 1 from public.reservations o where o.customer_user_id=p.id and o.payment_status='paid' and not o.is_demo)))
 order by c.starts_at desc,c.id;
$$;
revoke all on function public.customer_campaign_inbox(uuid) from public,anon,authenticated;
grant execute on function public.customer_campaign_inbox(uuid) to service_role;

-- Each row is exactly one order. Snapshots remain immutable. Legacy fee models
-- are intentionally not treated as current customer-fee receivables.
create view public.admin_commission_orders with (security_invoker=true) as
 select r.id,r.vendor_id,r.status::text as status,r.payment_status,r.created_at,
 coalesce(r.payment_confirmed_at,r.created_at) as earned_at,
 (r.is_demo or v.is_demo or p.is_demo) as is_demo,
 (s.customer_fee_standard_bps is not null) as current_fee_model,
 (s.reservation_id is not null) as has_snapshot,
 coalesce(r.vendor_confirmed_price_aed,s.total_price_aed) as order_total_aed,
 case when s.customer_fee_standard_bps is not null then round(s.platform_fee*s.quantity,2) else 0 end as fee_aed,
 case when s.customer_fee_standard_bps is not null then greatest(0,coalesce(s.delivery_fee_before_event_discount,s.delivery_fee)-s.delivery_fee) else 0 end as delivery_credit_aed,
 r.expires_at
 from public.reservations r
 join public.vendors v on v.id=r.vendor_id
 join public.products p on p.id=r.product_id
 left join public.order_price_snapshots s on s.reservation_id=r.id;
revoke all on public.admin_commission_orders from public,anon,authenticated;
grant select on public.admin_commission_orders to service_role;

create function public.manage_commission_entry(p_actor uuid,p_action text,p_id uuid,p_vendor uuid default null,p_kind text default null,p_amount numeric default null,p_note text default null,p_reference text default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_role public.user_role; v_old public.commission_ledger; v_new public.commission_ledger;
begin
 select role into v_role from public.profiles where id=p_actor;
 if v_role is null or v_role not in ('admin','super_admin') then raise exception 'not_authorized'; end if;
 if p_action='create' then
  insert into public.commission_ledger(id,vendor_id,kind,amount_aed,note,reference,created_by)
  values(p_id,p_vendor,p_kind,p_amount,p_note,p_reference,p_actor) returning * into v_new;
 elsif p_action='void' then
  if p_note is null or char_length(p_note)<5 then raise exception 'reason_required'; end if;
  select * into v_old from public.commission_ledger where id=p_id for update;
  if v_old.id is null or v_old.voided_at is not null then raise exception 'entry_changed'; end if;
  update public.commission_ledger set voided_at=now(),void_reason=p_note,voided_by=p_actor where id=p_id returning * into v_new;
 else raise exception 'invalid_action'; end if;
 insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,old_value,new_value)
 values(p_actor,v_role,'commission.'||p_action,'commission_ledger',p_id::text,case when v_old.id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return p_id;
end $$;
revoke all on function public.manage_commission_entry(uuid,text,uuid,uuid,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.manage_commission_entry(uuid,text,uuid,uuid,text,numeric,text,text) to service_role;
create function public.manage_notification_campaign(p_actor uuid,p_action text,p_id uuid,p_values jsonb default '{}'::jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_role public.user_role; v_old public.notification_campaigns; v_new public.notification_campaigns;
begin
 select role into v_role from public.profiles where id=p_actor;
 if v_role is null or v_role not in ('admin','super_admin') then raise exception 'not_authorized'; end if;
 if p_action='create' then
  insert into public.notification_campaigns(id,title,body,title_ar,body_ar,href,audience,starts_at,ends_at,created_by)
  values(p_id,p_values->>'title',p_values->>'body',p_values->>'title_ar',p_values->>'body_ar',
   p_values->>'href',p_values->>'audience',(p_values->>'starts_at')::timestamptz,(p_values->>'ends_at')::timestamptz,p_actor)
  returning * into v_new;
 else
  select * into v_old from public.notification_campaigns where id=p_id for update;
  if v_old.id is null or v_old.cancelled_at is not null then raise exception 'campaign_changed'; end if;
  if p_action='update' and v_old.published_at is null then
   update public.notification_campaigns set title=p_values->>'title',body=p_values->>'body',
    title_ar=p_values->>'title_ar',body_ar=p_values->>'body_ar',href=p_values->>'href',audience=p_values->>'audience',
    starts_at=(p_values->>'starts_at')::timestamptz,ends_at=(p_values->>'ends_at')::timestamptz,updated_at=now()
    where id=p_id returning * into v_new;
  elsif p_action='publish' and v_old.published_at is null and v_old.ends_at>now() then
   update public.notification_campaigns set published_at=now(),updated_at=now() where id=p_id returning * into v_new;
  elsif p_action='cancel' then
   update public.notification_campaigns set cancelled_at=now(),updated_at=now() where id=p_id returning * into v_new;
  else raise exception 'campaign_changed'; end if;
 end if;
 insert into public.audit_logs(actor_user_id,actor_role,action,entity_type,entity_id,old_value,new_value)
 values(p_actor,v_role,'notification_campaign.'||p_action,'notification_campaign',p_id::text,
  case when v_old.id is null then null else to_jsonb(v_old) end,to_jsonb(v_new));
 return p_id;
end $$;
revoke all on function public.manage_notification_campaign(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.manage_notification_campaign(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
