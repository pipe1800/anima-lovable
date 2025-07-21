import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

export type SupabaseClient = ReturnType<typeof createClient>;

export interface User {
  id: string;
  email?: string;
}

export interface AuthResult {
  user: User;
  supabase: SupabaseClient;
  supabaseAdmin: SupabaseClient;
  error?: boolean;
  response?: Response;
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};
