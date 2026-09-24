-- Preserve historical Sumsub references while making Didit the provider for
-- every new order. The stock-claim function is intentionally untouched: it
-- already consumes any approved provider result atomically with the row lock.
alter table public.order_identity_verifications
  drop constraint if exists order_identity_verifications_provider_check;

alter table public.order_identity_verifications
  alter column provider set default 'didit',
  add constraint order_identity_verifications_provider_check
    check (provider in ('sumsub', 'didit'));

create unique index if not exists order_identity_verifications_didit_session_idx
  on public.order_identity_verifications (provider_applicant_id)
  where provider = 'didit' and provider_applicant_id is not null;

comment on column public.order_identity_verifications.provider is
  'Hosted verification provider. New checks use Didit; sumsub remains valid only for historical rows.';
comment on column public.order_identity_verifications.provider_external_user_id is
  'Opaque Get Gold order-check identifier sent to the hosted provider as vendor data.';
comment on column public.order_identity_verifications.provider_applicant_id is
  'Provider session or applicant identifier; stores the Didit session_id for Didit checks.';
comment on column public.order_identity_verifications.verification_route is
  'uae_resident uses Emirates ID front/back plus liveness and face match; visitor uses passport, boarding-pass evidence, liveness and face match in the Didit workflow.';

notify pgrst, 'reload schema';
