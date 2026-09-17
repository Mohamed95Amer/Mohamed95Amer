-- Delivery companies are operational partners, never privileged platform roles.
-- Keep this enum change in its own migration so PostgreSQL can commit the new
-- value before later policies and functions reference it.
alter type public.user_role add value if not exists 'delivery_company';
