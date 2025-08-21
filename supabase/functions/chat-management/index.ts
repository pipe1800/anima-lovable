import { authenticateUser, createCorsResponse, createErrorResponse } from '../_shared/auth.ts';
import { withRateLimit, enforceJsonBodySize } from '../_shared/rate-limit.ts';
import { chatRequestUnion, safeParse, sanitizePayload } from '../_shared/validation.ts';
import { logger } from '../_shared/logger.ts';

// Lightweight PII redaction helper (kept)
function redactUserId(id?: string) {
  if (!id) return 'anon';
  return id.length > 8 ? `${id.slice(0,4)}…${id.slice(-2)}` : id;
}

// Unified handler context interface
interface ChatHandlerContext {
  operation: string;
  body: any;
  user: any;
  supabase: any;
  supabaseAdmin: any;
  rawReq: Request;
  requestId: string;
}

// Normalized handler type
type ChatHandler = (ctx: ChatHandlerContext) => Promise<Response | object>;

// Lazy loader registry returning normalized handlers
const handlerLoaders: Record<string, () => Promise<ChatHandler>> = {
  'create-basic': async () => {
    const m = await import('./modules/basic-chat-handler.ts');
    return async (ctx) => m.handleCreateBasicChat(ctx.body, ctx.user, ctx.supabase, { req: ctx.rawReq, supabaseAdmin: ctx.supabaseAdmin });
  },
  'create-with-greeting': async () => {
    const m = await import('./modules/greeting-processor.ts');
    return async (ctx) => m.handleCreateWithGreeting(ctx.body, ctx.user, ctx.supabase, ctx.supabaseAdmin, ctx.rawReq);
  },
  'send-message': async () => {
    const m = await import('./modules/send-message-handler.ts');
    return async (ctx) => m.handleSendMessage(ctx.body, ctx.user, ctx.supabase, ctx.supabaseAdmin, ctx.rawReq, { requestId: ctx.requestId });
  },
  'regenerate-message': async () => {
    const m = await import('./modules/regenerate-message-handler.ts');
    return async (ctx) => m.handleRegenerateMessage(ctx.body, ctx.user, ctx.supabase, ctx.supabaseAdmin, ctx.rawReq);
  },
  'extract-context': async () => {
    const m = await import('./modules/extract-context-handler.ts');
    return async (ctx) => m.handleExtractContext(ctx.body, ctx.user, ctx.supabase, ctx.supabaseAdmin);
  },
  'create-memory': async () => {
    const m = await import('./modules/memory-handler.ts');
    return async (ctx) => m.handleCreateMemory(ctx.body, ctx.user, ctx.supabase, ctx.supabaseAdmin);
  }
};

// Cache for loaded handlers (race-safe by storing promise first)
const handlerCache: Record<string, Promise<ChatHandler> | ChatHandler> = {};

async function getHandler(op: string): Promise<ChatHandler | null> {
  const loader = handlerLoaders[op];
  if (!loader) return null;
  const cached = handlerCache[op];
  if (cached) return typeof cached === 'function' ? cached : await cached;
  const p = loader();
  handlerCache[op] = p; // store promise immediately to avoid duplicate loads
  try {
    const h = await p;
    handlerCache[op] = h; // replace with resolved function
    return h;
  } catch (e) {
    logger.error('handler.load.failed', { op, message: (e as Error)?.message });
    delete handlerCache[op];
    return null;
  }
}

// Preprocess request body (normalize charactersData & sanitize once)
function preprocessBody(raw: any) {
  if (!raw || typeof raw !== 'object') return raw;
  // Shallow clone to avoid mutating upstream references
  const body = { ...raw };
  if (!body.charactersData && body.characterId) {
    body.charactersData = [{ id: body.characterId, name: body.characterName || 'Unknown' }];
  }
  sanitizePayload(body); // single pass
  return body;
}

globalThis.Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return createCorsResponse();
  if (req.url.includes('test')) {
    return createCorsResponse({
      message: 'Unified chat management function is working',
      timestamp: new Date().toISOString(),
      version: 'v4-unified',
      operations: Object.keys(handlerLoaders)
    });
  }

  const start = Date.now();
  const requestId = crypto.randomUUID();
  logger.info('chat.start', { requestId, method: req.method });

  try {
    const sizeResp = await enforceJsonBodySize(req);
    if (sizeResp) return sizeResp;

    const { user, supabase, supabaseAdmin } = await authenticateUser(req);

    return await withRateLimit(req, user?.id, async () => {
      let rawBody: any;
      try { rawBody = await req.json(); } catch { return createErrorResponse('Invalid JSON body', 400); }
      const preprocessed = preprocessBody(rawBody);
      const parsed = safeParse(chatRequestUnion, preprocessed);
      if (parsed.success === false) {
        logger.warn('validation.fail', { requestId, userId: redactUserId(user?.id), error: parsed.error });
        return createErrorResponse(`Invalid request: ${parsed.error}`, 400);
      }
      const body = parsed.data as any;
      const { operation } = body;
      if (!operation) return createErrorResponse('Missing operation field', 400);

      const handler = await getHandler(operation);
      if (!handler) return createErrorResponse(`Unknown operation: ${operation}`, 400);

      try {
        const result = await handler({ operation, body, user, supabase, supabaseAdmin, rawReq: req, requestId });
        const ms = Date.now() - start;
        logger.info('chat.complete', { requestId, op: operation, ms });
        if (result instanceof Response) return result; // streaming path
        // Ensure success flag for non-stream replies if handler didn't include it
        const payload = (result && typeof result === 'object' && !('success' in result)) ? { success: true, ...result } : result;
        return createCorsResponse(payload);
      } catch (handlerErr) {
        logger.error('handler.error', { requestId, op: operation, message: (handlerErr as Error)?.message });
        return createErrorResponse('Internal handler error', 500);
      }
    });
  } catch (e) {
    logger.error('chat.unhandled', { requestId, message: (e as Error)?.message });
    return createErrorResponse('Internal server error', 500);
  }
});
