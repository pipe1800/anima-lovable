SELECT
  n.nspname                              AS schema_name,
  c.relname                              AS table_name,
  c.relrowsecurity                       AS rls_enabled,
  c.relforcerowsecurity                  AS force_rls,
  COALESCE(p.policy_count, 0)            AS policy_count,
  COALESCE(p.policy_names, '')           AS policy_names,
  COALESCE(p.select_count, 0)            AS select_policies,
  COALESCE(p.insert_count, 0)            AS insert_policies,
  COALESCE(p.update_count, 0)            AS update_policies,
  COALESCE(p.delete_count, 0)            AS delete_policies,
  CASE
    WHEN NOT c.relrowsecurity THEN 'RLS_DISABLED'
    WHEN c.relrowsecurity AND COALESCE(p.policy_count,0)=0 THEN 'RLS_ENABLED_NO_POLICIES'
    ELSE 'RLS_OK'
  END                                     AS rls_status,
  COALESCE(p.any_always_true, false)      AS any_policy_always_true
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN (
  SELECT
    polrelid,
    COUNT(*)                                                    AS policy_count,
    string_agg(polname, ', ' ORDER BY polname)                  AS policy_names,
    COUNT(*) FILTER (WHERE polcmd='r' OR polcmd='*')            AS select_count,
    COUNT(*) FILTER (WHERE polcmd='a' OR polcmd='*')            AS insert_count,
    COUNT(*) FILTER (WHERE polcmd='w' OR polcmd='*')            AS update_count,
    COUNT(*) FILTER (WHERE polcmd='d' OR polcmd='*')            AS delete_count,
    BOOL_OR(
      pg_get_expr(polqual, polrelid) IN ('true','(true)')
      OR pg_get_expr(polwithcheck, polrelid) IN ('true','(true)')
    )                                                           AS any_always_true
  FROM pg_policy
  GROUP BY polrelid
) p ON p.polrelid = c.oid
WHERE c.relkind = 'r'
  AND n.nspname IN ('auth','billing','public')   -- adjust schemas as needed
ORDER BY schema_name, table_name;