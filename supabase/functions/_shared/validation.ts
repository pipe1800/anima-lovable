// Shared request validation utilities using Zod
// Centralizes schema creation & safe parsing to reduce injection / malformed input risk.
import { z } from 'https://esm.sh/zod@3.23.8';

// Generic helpers
export function safeParse<T extends z.ZodTypeAny>(schema: T, data: unknown): { success: true; data: z.infer<T> } | { success: false; error: string } {
  try {
    if (data && typeof data === 'object') {
      if (containsPrototypePollutionKeys(data)) {
        return { success: false, error: 'root: Disallowed object keys detected' };
      }
    }
    const result = schema.safeParse(data);
    if (result.success) return { success: true, data: result.data };
    const first = result.error.issues[0];
    return { success: false, error: `${first.path.join('.') || 'root'}: ${first.message}` };
  } catch {
    return { success: false, error: 'root: Validation exception' };
  }
}

// Chat Management Schemas
// ---------------------------------------------------------------------------
// Shared primitive guards / helpers
// ---------------------------------------------------------------------------
// Expanded detection for potentially executable or prompt-injection content.
const DANGEROUS_TAG_OR_ATTR_PATTERN = /<\/?(script|iframe|img|svg|object|embed|link|meta|style|form|video|audio|button|a|input|textarea|select|option|source|track|picture)\b|on[a-z]+\s*=/i;
const DANGEROUS_PROTOCOL_PATTERN = /(j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t\s*:|file\s*:|blob\s*:)/i;
const DATA_TEXT_PATTERN = /data:\s*text/i;
const GENERIC_HTML_TAG_PATTERN = /<\/?[a-z!][^>]*>/i; // fallback generic tag catch
const PROMPT_INJECTION_PATTERN = /(ignore (all )?(previous|earlier|prior) (instructions|directives|rules)|reveal (the )?(system|hidden) (prompt|instructions)|disregard (all )?(above|earlier) (context|rules)|you are no longer bound|act as (an?|if))/i;

function decodeHtmlEntities(str: string): string {
  return str.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
    const lower = ent.toLowerCase();
    if (lower === 'lt') return '<';
    if (lower === 'gt') return '>';
    if (lower === 'amp') return '&';
    if (lower === 'quot') return '"';
    if (lower === 'apos') return "'";
    if (lower.startsWith('#x')) {
      const code = parseInt(lower.slice(2), 16); if (!isNaN(code)) return String.fromCharCode(code);
    } else if (lower.startsWith('#')) {
      const code = parseInt(lower.slice(1), 10); if (!isNaN(code)) return String.fromCharCode(code);
    }
    return m;
  });
}

function normalizeSecurityInput(str: string): string {
  if (!str) return str;
  const unicodeDecoded = str.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
    const code = parseInt(hex, 16); return isNaN(code) ? _ : String.fromCharCode(code);
  });
  return decodeHtmlEntities(unicodeDecoded)
    .normalize('NFKC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function containsPrototypePollutionKeys(obj: unknown, depth = 0, maxDepth = 6): boolean {
  if (!isRecord(obj) || depth > maxDepth) return false;
  for (const key of Object.keys(obj)) {
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') return true;
    const value = obj[key];
    if (value && typeof value === 'object') {
      if (containsPrototypePollutionKeys(value, depth + 1, maxDepth)) return true;
    }
  }
  return false;
}

// Generic reusable safe text schema (sanitization + normalization + multi-pattern blocking)
const safeText = (min: number, max: number) => z.string()
  .min(min)
  .max(max)
  .transform(v => sanitizeString(v, max))
  .superRefine((v, ctx) => {
    const norm = normalizeSecurityInput(v);
    if (DANGEROUS_TAG_OR_ATTR_PATTERN.test(norm) || DANGEROUS_PROTOCOL_PATTERN.test(norm) || DATA_TEXT_PATTERN.test(norm)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Disallowed potentially executable markup' });
      return;
    }
    if (norm.includes('<') && GENERIC_HTML_TAG_PATTERN.test(norm)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'HTML tags are not allowed' });
      return;
    }
    if (PROMPT_INJECTION_PATTERN.test(norm)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Potential prompt-injection phrasing detected' });
      return;
    }
  });

// Restrict addon settings primitive values (avoid arbitrary object graphs)
const addonPrimitive = z.union([
  z.string().max(1000),
  z.number().finite(),
  z.boolean(),
  z.null()
]);

// Record of primitives with key & size limits
const addonSettingsSchema = z.record(addonPrimitive)
  .refine(obj => Object.keys(obj).length <= 25, { message: 'Too many addon settings (max 25)' })
  .refine(obj => !Object.keys(obj).some(k => ['__proto__', 'prototype', 'constructor'].includes(k)), { message: 'Invalid addon settings key' });

export const baseChatRequestSchema = z.object({
  operation: z.string().min(1).max(40),
  // Optional client timestamp for basic anti-replay / skew analysis
  client_ts: z.number().int().positive().optional(),
});

// Shared minimal character descriptor used by current edge function handlers.
const characterDescriptorSchema = z.object({
  id: z.string().uuid(),
  name: safeText(1, 200),
  // Optional descriptive fields (kept permissive – trimmed & size‑bounded by sanitizePayload)
  description: safeText(1, 4000).optional(),
  image_url: z.string().url().optional(),
  scenario: safeText(1, 4000).optional(),
  example_conversations: safeText(1, 8000).optional(),
  voice_id: safeText(1, 200).optional(),
  creator_notes: safeText(1, 4000).optional(),
  creator_id: z.string().uuid().optional(),
  is_nsfw: z.boolean().optional(),
  personality: safeText(1, 8000).optional(),
  first_message: safeText(1, 4000).optional(),
  message_example: safeText(1, 8000).optional(),
  context: safeText(1, 8000).optional(),
  scenario_context: safeText(1, 8000).optional(),
}).strip();

const charactersDataSchema = z.array(characterDescriptorSchema).min(1).max(5); // hard cap to avoid huge payloads

export const createBasicChatSchema = baseChatRequestSchema.extend({
  operation: z.literal('create-basic'),
  charactersData: charactersDataSchema,
  selectedPersonaId: z.string().uuid().nullable().optional(),
});

export const createWithGreetingSchema = baseChatRequestSchema.extend({
  operation: z.literal('create-with-greeting'),
  charactersData: charactersDataSchema,
  greeting: safeText(1, 8000).optional(), // matches handler expectation (greeting?)
  selectedPersonaId: z.string().uuid().nullable().optional(),
  chatMode: z.enum(['storytelling', 'companion']).optional(),
});

export const sendMessageSchema = baseChatRequestSchema.extend({
  operation: z.literal('send-message'),
  chatId: z.string().uuid(),
  message: safeText(1, 8000),
  meta: z.object({ retry: z.boolean().optional() }).optional(),
  characterId: z.string().uuid(),
  selectedPersonaId: z.string().uuid().nullable().optional(),
  selectedWorldInfoId: z.string().uuid().nullable().optional(),
  addonSettings: addonSettingsSchema.optional(),
});

export const extractContextSchema = baseChatRequestSchema.extend({
  operation: z.literal('extract-context'),
  chatId: z.string().uuid(),
});

export const createMemorySchema = baseChatRequestSchema.extend({
  operation: z.literal('create-memory'),
  chatId: z.string().uuid(),
  characterId: z.string().uuid(),
});

export const regenerateMessageSchema = baseChatRequestSchema.extend({
  operation: z.literal('regenerate-message'),
  chatId: z.string().uuid(),
  characterId: z.string().uuid(),
  aiMessageId: z.string().uuid(),
  selectedPersonaId: z.string().uuid().nullable().optional(),
  selectedWorldInfoId: z.string().uuid().nullable().optional(),
  addonSettings: addonSettingsSchema.optional(),
});

export const chatRequestUnion = z.discriminatedUnion('operation', [
  createBasicChatSchema,
  createWithGreetingSchema,
  sendMessageSchema,
  extractContextSchema,
  createMemorySchema,
  regenerateMessageSchema,
]).superRefine((val, ctx) => {
  // Basic replay / clock skew (client_ts must be within +/- 10 minutes if provided)
  if ('client_ts' in val && typeof val.client_ts === 'number') {
    const now = Date.now();
    const delta = Math.abs(now - val.client_ts);
    if (delta > 10 * 60 * 1000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'client_ts outside allowed skew',
        path: ['client_ts']
      });
    }
  }
});

// PayPal Management Schemas
export const paypalBaseSchema = z.object({
  operation: z.enum([
    'create-subscription',
    'verify-subscription',
    'cancel-subscription',
    'revise-subscription',
    'save-subscription',
    'create-order',
    'capture-order',
    'webhook'
  ]),
});

export const paypalSubscriptionId = z.string().min(3).max(128);

export const verifySubscriptionSchema = paypalBaseSchema.extend({
  operation: z.literal('verify-subscription'),
  subscriptionId: paypalSubscriptionId,
  state: z.string().min(8).max(256).optional(),
});

export const createSubscriptionSchema = paypalBaseSchema.extend({
  operation: z.literal('create-subscription'),
  planId: z.string().min(1).max(64),
  returnUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export const cancelSubscriptionSchema = paypalBaseSchema.extend({
  operation: z.literal('cancel-subscription'),
  subscriptionId: paypalSubscriptionId,
});

export const paypalRequestUnion = z.discriminatedUnion('operation', [
  createSubscriptionSchema,
  verifySubscriptionSchema,
  cancelSubscriptionSchema,
  paypalBaseSchema.extend({ operation: z.literal('save-subscription'), subscriptionId: paypalSubscriptionId }),
  paypalBaseSchema.extend({ operation: z.literal('revise-subscription'), subscriptionId: paypalSubscriptionId, newPlanId: z.string().min(1).max(64).optional() }),
  paypalBaseSchema.extend({ operation: z.literal('create-order'), productId: z.string().min(1).max(64), currency: z.string().length(3).default('USD') }),
  paypalBaseSchema.extend({ operation: z.literal('capture-order'), orderId: z.string().min(3).max(128) }),
  paypalBaseSchema.extend({ operation: z.literal('webhook') }),
]);

// Memories fetch schema
export const getMemoriesSchema = z.object({
  characterId: z.string().uuid(),
  userId: z.string().uuid(),
});

// Parse Character Card (JSON mode only – multipart handled separately)
export const parseCharacterCardJsonSchema = z.object({
  store_avatar: z.boolean().optional(),
  persist: z.boolean().optional(),
  bypass_cache: z.boolean().optional(),
  storage_bucket: z.string().min(1).max(100).optional(),
  storage_path: z.string().min(3).max(500).optional(),
  url: z.string().url().optional(),
  base64: z.string().max(25_000_000).optional(), // ~18MB base64 cap
}).refine(obj => !!(obj.storage_bucket && obj.storage_path) || !!obj.url || !!obj.base64, {
  message: 'One of (storage_bucket + storage_path) | url | base64 required'
});

// Generic sanitizer for strings (basic, non-destructive)
export function sanitizeString(input: string, max = 8000) {
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1F]/g, ' ') // strip control chars
    .replace(/\s+/g, ' ') // collapse whitespace
    .slice(0, max)
    .trim();
}

export function sanitizePayload(obj: unknown, stringMax = 8000): unknown {
  if (Array.isArray(obj)) {
    for (let index = 0; index < obj.length; index += 1) {
      const value = obj[index];
      if (typeof value === 'string') {
        obj[index] = sanitizeString(value, stringMax);
      } else if (value && typeof value === 'object') {
        sanitizePayload(value, stringMax);
      }
    }
    return obj;
  }

  if (!isRecord(obj)) {
    return obj;
  }

  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (typeof value === 'string') {
      obj[key] = sanitizeString(value, stringMax);
    } else if (value && typeof value === 'object') {
      sanitizePayload(value, stringMax);
    }
  }
  return obj;
}
