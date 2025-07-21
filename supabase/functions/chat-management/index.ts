import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings } from '../_shared/settings-mapper.ts';

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
    console.log('🔐 Starting user authentication...');
    const { user, supabase, supabaseAdmin } = await authenticateUser(req);
    console.log('👤 User authenticated successfully:', user.id);

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

  } catch (error) {
    console.error('💥 Unhandled error in chat management:', error);
    return createErrorResponse(
      error instanceof Error ? error.message : 'Internal server error',
      500
    );
  }
});
