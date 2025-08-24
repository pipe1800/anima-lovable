-- Resolve tag names to id+name (case-insensitive) in a single secure RPC
-- Generated: 2025-08-21
-- Purpose: eliminate repeated small SELECTs on public.tags for name->id mapping.
-- Security: relies on existing RLS on public.tags. Function is STABLE and executes with invoker rights.

-- Roll forward: create or replace function
CREATE OR REPLACE FUNCTION public.resolve_tag_names(p_names text[])
RETURNS TABLE(id int4, name text)
LANGUAGE sql
STABLE
AS $$
  SELECT t.id, t.name
  FROM public.tags t
  JOIN LATERAL (
    SELECT unnest(p_names) AS qn
  ) q ON lower(t.name) = lower(q.qn)
  ORDER BY t.name;
$$;

COMMENT ON FUNCTION public.resolve_tag_names(text[]) IS 'Bulk resolve tag names (case-insensitive) to ids. Uses existing RLS on tags.';

-- Optional: revoke from anonymous if you need only authenticated usage (adjust per policy)
-- REVOKE EXECUTE ON FUNCTION public.resolve_tag_names(text[]) FROM anon;
-- GRANT EXECUTE ON FUNCTION public.resolve_tag_names(text[]) TO authenticated, service_role;

-- Rollback instructions (manual):
-- DROP FUNCTION IF EXISTS public.resolve_tag_names(text[]);
