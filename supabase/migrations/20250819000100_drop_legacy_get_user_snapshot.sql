-- Dev cleanup: drop legacy get_user_snapshot (v1) in favor of get_user_snapshot_v2
DROP FUNCTION IF EXISTS public.get_user_snapshot(uuid);
