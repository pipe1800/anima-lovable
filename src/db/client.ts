import { supabase, SUPABASE_API_URL } from '@/integrations/supabase/client';
// Use this re-exported client everywhere outside the integrations layer.
// TODO: If we add logging/metrics wrappers, implement them here to avoid leaking raw client.
export { supabase, SUPABASE_API_URL };
