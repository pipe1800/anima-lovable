import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
// Declare Deno for type-checking if executing under Node locally
declare const Deno: any;
import type { AuthResult } from '../types/interfaces.ts';
import { CORS_HEADERS } from '../types/interfaces.ts';

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

  const supabaseUrl = (globalThis as any).Deno?.env?.get('SUPABASE_URL') || (typeof process !== 'undefined' ? process.env.SUPABASE_URL : undefined);
  const supabaseAnon = (globalThis as any).Deno?.env?.get('SUPABASE_ANON_KEY') || (typeof process !== 'undefined' ? process.env.SUPABASE_ANON_KEY : undefined);
  if (!supabaseUrl || !supabaseAnon) {
    console.error('❌ Supabase environment variables missing');
    throw new Error('Server misconfiguration');
  }
  const supabase = createClient(
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
  
  const serviceKey = (globalThis as any).Deno?.env?.get('SUPABASE_SERVICE_ROLE_KEY') || (typeof process !== 'undefined' ? process.env.SUPABASE_SERVICE_ROLE_KEY : undefined);
  if (!serviceKey) {
    console.error('❌ Service role key missing');
    throw new Error('Server misconfiguration');
  }
  const supabaseAdmin = createClient(
    supabaseUrl,
    serviceKey
  );
  
  console.log('✅ User authenticated successfully:', user.id);
  
  return {
    user: { id: user.id, email: user.email } as any,
    supabase: supabase as any,
    supabaseAdmin: supabaseAdmin as any
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
