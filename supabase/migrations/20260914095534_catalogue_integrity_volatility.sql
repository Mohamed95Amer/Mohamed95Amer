-- JSON constructors / polymorphic text conversion are STABLE in Postgres.
-- This helper is trigger-called, not an index expression or generated column.
alter function public.product_integrity_issues(text, text, text, integer, numeric,
  integer, numeric, integer, numeric, text, text, jsonb) stable;
