import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import type { AuthResult } from '../types/interfaces.ts';
import { CORS_HEADERS } from '../types/interfaces.ts';

/**
 * Authentication utilities for chat-stream function
 * Handles user authentication and creates both user-scoped and admin Supabase clients
 */

export async function authenticateUser(req: Request): Promise<AuthResult> {
  console.log('🔐 Starting authentication...');
  
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    console.error('❌ No authorization header found');
    throw new Error('No authorization header');
  }
  
  console.log('🔐 Auth header found:', authHeader.substring(0, 20) + '...');
  
  // Create user-scoped client for authentication and RLS
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
  
  console.log('🔐 Supabase client created, validating user...');
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  console.log('🔐 Auth validation result:', {
    hasUser: !!user,
    userId: user?.id,
    error: authError?.message || 'none'
  });
  
  if (authError || !user) {
    console.error('❌ Authentication failed:', authError);
    throw new Error('Invalid token');
  }
  
  // Create admin client for privileged operations
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  console.log('✅ User authenticated successfully:', user.id);
  
  return {
    user,
    supabase,
    supabaseAdmin
  };
}

export function createCorsResponse(data: any = null, status: number = 200): Response {
  return new Response(
    data ? JSON.stringify(data) : null,
    {
      status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    }
  );
}

export function createErrorResponse(error: string, status: number = 500): Response {
  return createCorsResponse({ error }, status);
}

export function createStreamingErrorResponse(error: string): Response {
  const errorStream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      const errorMessage = `Error: ${error}. Please try again.`;
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"${errorMessage}"}}]}\n\n`));
      controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
      controller.close();
    }
  });

  return new Response(errorStream, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}
