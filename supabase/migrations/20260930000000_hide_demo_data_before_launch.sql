-- Public demo stores, listings and reviews must not appear as real marketplace
-- activity at launch. Admins can opt back in from the dashboard for testing.
alter table public.platform_settings
  alter column demo_data_visible set default false;

update public.platform_settings
set demo_data_visible = false
where demo_data_visible = true;
