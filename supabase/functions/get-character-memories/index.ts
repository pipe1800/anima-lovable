import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { getMemoriesSchema, safeParse, sanitizePayload } from '../_shared/validation.ts';
import { fetchCharacterMemories } from '../chat-management/modules/database.ts';

function redactUserId(id?: string) {
  if (!id) return 'anon';
  return id.length > 8 ? `${id.slice(0,4)}…${id.slice(-2)}` : id;
}

interface GetMemoriesRequest {
  characterId: string;
  userId: string;
}

globalThis.Deno.serve(async (req) => {
  // Handle CORS for preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
    });
  }

  try {
    const { user, supabase, supabaseAdmin } = await authenticateUser(req);
    
    if (!user) {
      return createErrorResponse('Unauthorized', 401);
    }

  let rawBody: any;
  try { rawBody = await req.json(); } catch { return createErrorResponse('Invalid JSON body', 400); }
  sanitizePayload(rawBody, 4000);
  const parsed = safeParse(getMemoriesSchema, rawBody);
  if (parsed.success === false) return createErrorResponse(`Invalid request: ${parsed.error}`, 400);
  const { characterId, userId } = parsed.data;

    // Only allow users to fetch their own memories
    if (userId !== user.id) {
      return createErrorResponse('Forbidden', 403);
    }

  console.log('🧠 Fetching memories for character:', { characterId, user: redactUserId(userId) });

    const memories = await fetchCharacterMemories(userId, characterId, supabaseAdmin, {
      includeAutoSummaries: true,
      limitNonAuto: 100,
      limitAuto: 20
    });

    console.log('✅ Successfully fetched memories:', memories.length);

    return createCorsResponse({
      success: true,
      data: memories
    });

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    return createErrorResponse('Internal server error', 500);
  }
});
