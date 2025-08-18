import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings } from '../_shared/settings-mapper.ts';

// Import handlers for different operations
import { handleCreateBasicChat } from './modules/basic-chat-handler.ts';
import { handleCreateWithGreeting } from './modules/greeting-processor.ts';
import { handleExtractContext } from './modules/extract-context-handler.ts';
import { handleSendMessage } from './modules/send-message-handler.ts';
import { handleCreateMemory } from './modules/memory-handler.ts';
// Added imports for bootstrap
import { 
  fetchSelectedPersona, 
  fetchChatSelectedPersona, 
  fetchUserGlobalSettings, 
  fetchUserProfile, 
  fetchCurrentContext, 
  fetchCharacterData, 
  fetchConversationHistory, 
  getLatestAutoSummary 
} from './modules/database.ts';

// Import types
import type { 
  ChatManagementRequest, 
  ChatResponse,
  CreateBasicChatRequest,
  CreateWithGreetingRequest,
  ExtractContextRequest,
  CreateMemoryRequest
} from './types/index.ts';

/**
 * Unified Chat Management Edge Function
 * 
 * Consolidates all chat operations into a single function:
 * 
 * Operations Supported:
 * ✅ 'create-basic'        - Create basic chat with simple greeting
 * ✅ 'create-with-greeting' - Create chat with custom greeting and context
 * ✅ 'send-message'        - Stream AI responses with full persona context
 * ✅ 'extract-context'     - Extract context for existing chats
 * ✅ 'create-memory'       - Create AI-powered chat memory summaries
 * 
 * Key Features:
 * ✅ Authentication & Authorization
 * ✅ Persona Context Integration (name, bio, lore)
 * ✅ Credit Billing & Consumption  
 * ✅ Character Data Fetching
 * ✅ Conversation History Management
 * ✅ Template Replacement
 * ✅ Addon Context Extraction
 * ✅ System Prompt Building
 * ✅ AI Message Generation
 * ✅ Real-time Streaming
 * ✅ Database Message Persistence
 * ✅ Context Updates
 * ✅ Chat Activity Updates
 * ✅ Error Handling & CORS
 * ✅ World Info Integration
 */

globalThis.Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('📋 CORS preflight request received');
    return createCorsResponse();
  }

  // Test endpoint for debugging
  if (req.url.includes('test')) {
    console.log('🧪 Test endpoint reached');
    return createCorsResponse({
      message: 'Unified chat management function is working',
      timestamp: new Date().toISOString(),
      version: 'v3-unified',
      operations: ['create-basic', 'create-with-greeting', 'send-message', 'extract-context', 'create-memory']
    });
  }

  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  
  console.log('🚀 Unified Chat Management function called');
  console.log('📝 Request ID:', requestId);

  try {
    // ============================================================================
    // AUTHENTICATION
    // ============================================================================
    // Reduce duplicate logs: shared auth module logs details
    const { user, supabase, supabaseAdmin } = await authenticateUser(req);

    // ============================================================================
    // REQUEST PARSING & VALIDATION
    // ============================================================================
    console.log('📥 Parsing request body...');
    const requestBody: ChatManagementRequest = await req.json();
    const { operation } = requestBody;

    if (!operation) {
      console.error('❌ Missing operation field');
      return createErrorResponse('Missing operation field', 400);
    }

    console.log('📋 Operation requested:', operation);

    // ============================================================================
    // ROUTE TO APPROPRIATE HANDLER
    // ============================================================================
    let response: ChatResponse | Response;

    switch (operation) {
      case 'bootstrap': {
        console.log('🎯 Routing to bootstrap payload aggregation');
        const { chatId, characterId, includeMessages = true, messageLimit = 30 } = (requestBody as any);

        const basePromises: any[] = [
          fetchUserProfile(user.id, supabase),
          fetchUserGlobalSettings(user.id, supabaseAdmin as any),
        ];
        if (characterId) basePromises.push(fetchCharacterData(characterId, supabase as any));
        if (chatId) basePromises.push(fetchChatSelectedPersona(chatId, user.id, supabase as any));

        const [profile, globalSettings, characterDataOrUndefined, chatPersonaOrNull] = await Promise.all(basePromises);

        let resolvedPersona: any = chatPersonaOrNull || null;
        if (!resolvedPersona && (profile as any)?.default_persona_id) {
          const { data: defaultPersona } = await (supabase as any)
            .from('personas')
            .select('id, name, bio, lore, avatar_url')
            .eq('id', (profile as any).default_persona_id)
            .eq('user_id', user.id)
            .maybeSingle();
          if (defaultPersona) resolvedPersona = defaultPersona;
        }

        const personasPromise = (supabase as any)
          .from('personas')
          .select('id, name, avatar_url, updated_at')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false })
          .limit(25);

        // NEW: user_character_settings (full) for this character to avoid duplicate fetches client-side
        let userCharacterSettings: any = null;
        if (characterId) {
          const { data: ucs } = await (supabase as any)
            .from('user_character_settings')
            .select('*')
            .eq('user_id', user.id)
            .eq('character_id', characterId)
            .maybeSingle();
          userCharacterSettings = ucs || null;
        }

        let messages: any[] = [];
        let context: any = {};
        if (chatId && includeMessages) {
          const [history, ctx] = await Promise.all([
            fetchConversationHistory(chatId, supabase as any, messageLimit),
            characterId ? fetchCurrentContext(user.id, chatId, characterId, supabase as any) : Promise.resolve({})
          ]);
          messages = history;
          context = ctx;
        }

        let latestAutoSummary = null;
        if (characterId) {
          latestAutoSummary = await getLatestAutoSummary(characterId, supabase as any);
        }

        const { data: personasList, error: personasError } = await personasPromise;
        if (personasError) console.warn('Personas list error', personasError);

        // REPLACED: credit packs aggregation with direct credits table balance
        let creditsBalance = 0;
        try {
          const { data: creditsRow, error: creditsError } = await (supabase as any)
            .from('credits')
            .select('balance')
            .eq('user_id', user.id)
            .maybeSingle();
          if (!creditsError && creditsRow?.balance != null) creditsBalance = creditsRow.balance;
        } catch (e) {
          console.warn('Credits fetch failed, defaulting to 0');
        }

        response = {
          profile,
          globalSettings,
          character: characterDataOrUndefined ? { ...characterDataOrUndefined } : null,
          selectedPersona: resolvedPersona,
          personas: personasList || [],
          chatId: chatId || null,
          characterId: characterId || null,
          messages,
          context,
          latestAutoSummary,
          creditsBalance,
          userCharacterSettings,
          now: new Date().toISOString(),
          featureFlags: { debugPanel: false },
        } as any;
        break;
      }

      case 'create-basic':
        console.log('🎯 Routing to basic chat creation...');
        response = await handleCreateBasicChat(
          requestBody as CreateBasicChatRequest,
          user,
          supabase
        );
        break;

      case 'create-with-greeting':
        console.log('🎯 Routing to greeting chat creation...');
        response = await handleCreateWithGreeting(
          requestBody as CreateWithGreetingRequest,
          user,
          supabase,
          supabaseAdmin
        );
        break;

      case 'send-message':
        console.log('🎯 Routing to message streaming...');
        response = await handleSendMessage(
          requestBody as any, // Will be typed properly in the handler
          user,
          supabase,
          supabaseAdmin,
          req
        );
        break;

      case 'regenerate-message':
        console.log('🎯 Routing to regenerate message...');
        {
          const { handleRegenerateMessage } = await import('./modules/regenerate-message-handler.ts');
          response = await handleRegenerateMessage(
            requestBody as any,
            user,
            supabase,
            supabaseAdmin,
            req
          );
        }
        break;

      case 'extract-context':
        console.log('🎯 Routing to context extraction...');
        response = await handleExtractContext(
          requestBody as ExtractContextRequest,
          user,
          supabase,
          supabaseAdmin
        );
        break;

      case 'create-memory':
        console.log('🎯 Routing to memory creation...');
        response = await handleCreateMemory(
          requestBody as CreateMemoryRequest,
          user,
          supabase,
          supabaseAdmin
        );
        break;

      case 'list-chats-batched': {
        console.log('🎯 Routing to batched chats listing');
        const userId = user?.id;
        if (!userId) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
        try {
          // Single query using lateral joins / aggregate subqueries for counts + last message
          const { data, error } = await supabaseAdmin.rpc('get_user_chats_batched', { p_user_id: userId });
          if (error) throw error;
          return new Response(JSON.stringify({ chats: data || [] }), { status: 200 });
        } catch (err: any) {
          return new Response(JSON.stringify({ error: err.message || 'Failed to list chats' }), { status: 500 });
        }
      }

      default:
        console.error('❌ Unknown operation:', operation);
        return createErrorResponse(`Unknown operation: ${operation}`, 400);
    }

    // ============================================================================
    // RESPONSE HANDLING
    // ============================================================================
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Operation '${operation}' completed in ${duration}ms`);
    
    // For streaming responses, return them directly
    if (operation === 'send-message' && response instanceof Response) {
      return response; // This should be a streaming Response object
    }

    // For regular JSON responses
    return createCorsResponse(response);

  } catch (error) {
    console.error('💥 Unhandled error in chat management:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});

// Add to allowed operations type (search and extend if defined)
// Assuming there is an Operation type union
// type Operation = 'create-basic' | 'create-with-greeting' | 'send-message' | 'extract-context' | 'create-memory' | 'regenerate-message' | 'bootstrap';
// Extend dynamically if type exists
// @ts-ignore - augmenting at runtime
// eslint-disable-next-line
const allowedOps = ['create-basic','create-with-greeting','send-message','extract-context','create-memory','regenerate-message','bootstrap','list-chats-batched'];
