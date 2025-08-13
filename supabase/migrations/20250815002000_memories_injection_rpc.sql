-- RPC to mark a list of memories as injected (increment count and set timestamp)
CREATE OR REPLACE FUNCTION public.mark_memories_injected(mem_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.character_memories
     SET injection_count = COALESCE(injection_count, 0) + 1,
         last_injected_at = now()
   WHERE id = ANY (mem_ids);
$$;

-- Allow execution by authenticated users and service role
GRANT EXECUTE ON FUNCTION public.mark_memories_injected(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_memories_injected(uuid[]) TO service_role;
