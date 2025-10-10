import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
import type { SupabaseClient } from '../types/interfaces.ts';
import type { AuthResult } from '../types/interfaces.ts';
import { CORS_HEADERS } from '../types/interfaces.ts';
import { getEnv } from './env.ts';

/**
 * Authentication utilities for chat-stream function
 * Handles user authentication and creates both user-scoped and admin Supabase clients
 */

export async function authenticateUser(req: Request): Promise<AuthResult> {
  // Minimal logs here; callers can log request IDs
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    console.error('❌ No authorization header found');
    throw new Error('No authorization header');
  }

  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseAnon = getEnv('SUPABASE_ANON_KEY');
  const supabase: SupabaseClient = createClient(
    supabaseUrl,
    supabaseAnon,
    {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    }
  );
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    console.error('❌ Authentication failed:', authError);
    throw new Error('Invalid token');
  }
  
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseAdmin: SupabaseClient = createClient(
    supabaseUrl,
    serviceKey
  );
  
  console.log('✅ User authenticated successfully:', user.id);
  
  return {
    user: { id: user.id, email: user.email ?? undefined },
    supabase,
    supabaseAdmin,
  };
}

export function createCorsResponse(data: unknown = null, status: number = 200): Response {
  const body = data === null ? null : JSON.stringify(data);
  return new Response(
    body,
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
  const errorStream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const errorMessage = `Error: ${error}. Please try again.`;
      controller.enqueue(encoder.encode(`data: {"choices":[{"delta":{"content":"${errorMessage}"}}]}\n\n`));
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
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
