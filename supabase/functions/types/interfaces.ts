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

// Dynamically derive allowed origins (comma-separated) – fallback to * for local/dev
const rawAllowed = (globalThis.Deno?.env?.get('ALLOWED_ORIGINS') || '').trim();
let allowOrigin = '*';
if (rawAllowed) {
  try {
    const origins = rawAllowed.split(',').map(o => o.trim()).filter(Boolean);
    if (origins.length === 1) {
      allowOrigin = origins[0];
    } else if (origins.length > 1) {
      // For multiple, we'll validate per-request elsewhere; here default to first
      allowOrigin = origins[0];
    }
  } catch { /* noop */ }
}

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': allowOrigin,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
};
