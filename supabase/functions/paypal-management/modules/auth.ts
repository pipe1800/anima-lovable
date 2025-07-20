import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

export function createCorsResponse(data?: any, status = 200) {
  return new Response(
    data ? JSON.stringify(data) : null,
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

export function createErrorResponse(message: string, status = 500, additionalData?: any) {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      ...additionalData
    }),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    }
  );
}

export async function authenticateUser(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    throw new Error('No authorization header provided');
  }

  // Create user-scoped client for RLS
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );

  // Create admin client for privileged operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Get user from auth header
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    throw new Error(`Authentication failed: ${authError?.message || 'Invalid token'}`);
  }

  if (!user.email) {
    throw new Error('User email not available');
  }

  return { user, supabase, supabaseAdmin };
}

export { corsHeaders };
