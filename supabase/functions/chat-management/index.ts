import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { mapGlobalSettingsToAddonSettings } from '../_shared/settings-mapper.ts';
import { withRateLimit, enforceJsonBodySize } from '../_shared/rate-limit.ts';
import { chatRequestUnion, safeParse, sanitizePayload } from '../_shared/validation.ts';
import { logger } from '../_shared/logger.ts';

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
  if (req.method === 'OPTIONS') {
    logger.trace('cors.preflight');
    return createCorsResponse();
  }
  if (req.url.includes('test')) {
    logger.info('test.endpoint');
    return createCorsResponse({
      message: 'Unified chat management function is working',
      timestamp: new Date().toISOString(),
      version: 'v3-unified',
      operations: ['create-basic', 'create-with-greeting', 'send-message', 'extract-context', 'create-memory']
    });
  }
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  logger.info('chat-mgmt.start', { requestId, method: req.method });
  try {
    const sizeResp = await enforceJsonBodySize(req);
    if (sizeResp) return sizeResp;
    const { user, supabase, supabaseAdmin } = await authenticateUser(req);
    return await withRateLimit(req, user?.id, async () => {
      logger.debug('request.authenticated', { userId: user?.id });
      logger.debug('request.body.parse');
      let rawBody: any;
      try { rawBody = await req.json(); } catch { return createErrorResponse('Invalid JSON body', 400); }
      sanitizePayload(rawBody);
      if (rawBody && typeof rawBody === 'object') {
        if (!rawBody.charactersData && rawBody.characterId && rawBody.characterName) {
          rawBody.charactersData = [{ id: rawBody.characterId, name: rawBody.characterName }];
        }
        if (!rawBody.charactersData && rawBody.characterId) {
          rawBody.charactersData = [{ id: rawBody.characterId, name: 'Unknown' }];
        }
      }
      const parsed = safeParse(chatRequestUnion, rawBody);
      if (parsed.success === false) {
        logger.warn('request.validation.failed', { error: parsed.error });
        return createErrorResponse(`Invalid request: ${parsed.error}`, 400);
      }
      const requestBody = parsed.data as any;
      const { operation } = requestBody;
      if (!operation) {
        logger.error('operation.missing');
        return createErrorResponse('Missing operation field', 400);
      }
      logger.info('operation.route', { operation });
      let response: any;
      switch (operation) {
        case 'create-basic':
          response = await (await import('./modules/basic-chat-handler.ts')).handleCreateBasicChat(requestBody, user, supabase, { req, supabaseAdmin });
          break;
        case 'create-with-greeting':
          response = await (await import('./modules/greeting-processor.ts')).handleCreateWithGreeting(requestBody, user, supabase, supabaseAdmin, req);
          break;
        case 'send-message':
          response = await (await import('./modules/send-message-handler.ts')).handleSendMessage(requestBody, user, supabase, supabaseAdmin, req);
          break;
        case 'regenerate-message':
          response = await (await import('./modules/regenerate-message-handler.ts')).handleRegenerateMessage(requestBody, user, supabase, supabaseAdmin, req);
          break;
        case 'extract-context':
          response = await (await import('./modules/extract-context-handler.ts')).handleExtractContext(requestBody, user, supabase, supabaseAdmin);
          break;
        case 'create-memory':
          response = await (await import('./modules/memory-handler.ts')).handleCreateMemory(requestBody, user, supabase, supabaseAdmin);
          break;
        default:
          logger.warn('operation.unknown', { operation });
          return createErrorResponse(`Unknown operation: ${operation}`, 400);
      }
      const duration = Date.now() - startTime;
      logger.info('operation.complete', { operation, ms: duration });
      if (operation === 'send-message' && response instanceof Response) return response;
      return createCorsResponse(response);
    });
  } catch (error) {
    logger.error('chat-mgmt.unhandled', { message: (error as Error)?.message });
    return createErrorResponse(error instanceof Error ? error.message : 'Internal server error', 500);
  }
});
