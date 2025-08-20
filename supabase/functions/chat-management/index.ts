import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings } from '../_shared/settings-mapper.ts';
import { withRateLimit, enforceJsonBodySize } from '../_shared/rate-limit.ts';
import { chatRequestUnion, safeParse, sanitizePayload } from '../_shared/validation.ts';

// Import handlers for different operations
import { handleCreateBasicChat } from './modules/basic-chat-handler.ts';
import { handleCreateWithGreeting } from './modules/greeting-processor.ts';
import { handleExtractContext } from './modules/extract-context-handler.ts';
import { handleSendMessage } from './modules/send-message-handler.ts';
import { handleCreateMemory } from './modules/memory-handler.ts';

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

// Lightweight PII redaction helper
function redactUserId(id?: string) {
  if (!id) return 'anon';
  // Hash-ish: keep first 4 + last 2 to aid correlation without full UUID exposure
  return id.length > 8 ? `${id.slice(0,4)}…${id.slice(-2)}` : id;
}

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
    // Hard Cost Fail: reject large JSON early
    const sizeResp = await enforceJsonBodySize(req);
    if (sizeResp) return sizeResp;
    // ============================================================================
    // AUTHENTICATION
    // ============================================================================
  // Reduce duplicate logs: shared auth module logs details
  const { user, supabase, supabaseAdmin } = await authenticateUser(req);

  return await withRateLimit(req, user?.id, async () => {

    // ============================================================================
    // REQUEST PARSING & VALIDATION
    // ============================================================================
  console.log('📥 Parsing request body (body size guarded)...');
  let rawBody: any;
    try {
      rawBody = await req.json();
    } catch {
      return createErrorResponse('Invalid JSON body', 400);
    }
    sanitizePayload(rawBody);
    // Backward compatibility shim: legacy clients may send characterId + characterName instead of charactersData
    if (rawBody && typeof rawBody === 'object') {
      if (!rawBody.charactersData && rawBody.characterId && rawBody.characterName) {
        rawBody.charactersData = [{ id: rawBody.characterId, name: rawBody.characterName }];
      }
      // Some even older versions used just characterId and we infer name later – supply placeholder
      if (!rawBody.charactersData && rawBody.characterId) {
        rawBody.charactersData = [{ id: rawBody.characterId, name: 'Unknown' }];
      }
    }
    const parsed = safeParse(chatRequestUnion, rawBody);
    if (parsed.success === false) {
      return createErrorResponse(`Invalid request: ${parsed.error}`, 400);
    }
    const requestBody = parsed.data as ChatManagementRequest;
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
      case 'create-basic':
  console.log('🎯 Routing to basic chat creation...');
        response = await handleCreateBasicChat(
          requestBody as CreateBasicChatRequest,
          user,
          supabase,
          { req, supabaseAdmin }
        );
        break;

      case 'create-with-greeting':
  console.log('🎯 Routing to greeting chat creation...');
        response = await handleCreateWithGreeting(
          requestBody as CreateWithGreetingRequest,
          user,
          supabase,
          supabaseAdmin,
          req
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
    });

  } catch (error) {
    console.error('💥 Unhandled error in chat management:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
