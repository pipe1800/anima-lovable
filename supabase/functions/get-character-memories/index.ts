import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';

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

    const body: GetMemoriesRequest = await req.json();
    const { characterId, userId } = body;

    if (!characterId || !userId) {
      return createErrorResponse('Missing required fields', 400);
    }

    // Only allow users to fetch their own memories
    if (userId !== user.id) {
      return createErrorResponse('Forbidden', 403);
    }

    console.log('🧠 Fetching memories for character:', { characterId, userId });

    // Fetch memories from the database
    const { data: memories, error } = await supabaseAdmin
      .from('character_memories')
      .select('*')
      .eq('character_id', characterId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('❌ Error fetching memories:', error);
      return createErrorResponse('Failed to fetch memories', 500);
    }

    console.log('✅ Successfully fetched memories:', memories?.length || 0);

    return createCorsResponse({
      success: true,
      data: memories || []
    });

  } catch (error) {
    console.error('💥 Unexpected error:', error);
    return createErrorResponse('Internal server error', 500);
  }
});
