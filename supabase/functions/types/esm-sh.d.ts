// Ambient module declarations for remote ESM imports used in Edge Functions.
// Satisfies local TypeScript language service without changing runtime behavior.
// Deno Edge will fetch these URLs at runtime; we just map them to existing package types.

declare module 'https://esm.sh/zod@3.23.8' {
  export * from 'zod';
}

declare module 'https://esm.sh/@supabase/supabase-js@2.50.3' {
  export * from '@supabase/supabase-js';
}
