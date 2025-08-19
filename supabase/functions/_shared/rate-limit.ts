// Simple in-memory rate limiting & concurrency guards for Edge Functions.
// NOTE: Non-durable (per instance). For stronger guarantees use Redis or Postgres.

interface BucketState { tokens: number; last: number; }

declare global {
  // eslint-disable-next-line no-var
  var __rlBuckets: { ip: Map<string, BucketState>; user: Map<string, BucketState> } | undefined;
  // eslint-disable-next-line no-var
  var __rlConcurrency: { inFlight: number } | undefined;
}

if (!globalThis.__rlBuckets) {
  globalThis.__rlBuckets = { ip: new Map(), user: new Map() };
}
if (!globalThis.__rlConcurrency) {
  globalThis.__rlConcurrency = { inFlight: 0 };
}

// Configuration (override via env vars)
const IP_CAP = Number(globalThis.Deno?.env?.get('RL_IP_TOKENS_PER_MIN') || 120); // 120 req/min/IP
const USER_CAP = Number(globalThis.Deno?.env?.get('RL_USER_TOKENS_PER_MIN') || 240); // 240 req/min/user
const GLOBAL_CONCURRENCY_MAX = Number(globalThis.Deno?.env?.get('RL_GLOBAL_CONCURRENCY') || 40);
const MAX_JSON_BODY_BYTES = Number(globalThis.Deno?.env?.get('RL_MAX_JSON_BODY_BYTES') || (512 * 1024)); // 512KB

function refill(bucket: BucketState, cap: number, refillPerSecond: number) {
  const now = Date.now();
  const elapsedSec = (now - bucket.last) / 1000;
  if (elapsedSec > 0) {
    bucket.tokens = Math.min(cap, bucket.tokens + elapsedSec * refillPerSecond);
    bucket.last = now;
  }
}

function take(map: Map<string, BucketState>, key: string, cap: number, perMinute: number, cost = 1) {
  const refillPerSecond = perMinute / 60;
  let b = map.get(key);
  if (!b) { b = { tokens: cap, last: Date.now() }; map.set(key, b); }
  refill(b, cap, refillPerSecond);
  if (b.tokens >= cost) {
    b.tokens -= cost;
    return { allowed: true, remaining: Math.floor(b.tokens), retryAfter: 0 };
  }
  const deficit = cost - b.tokens;
  const retryAfter = deficit / refillPerSecond; // seconds
  return { allowed: false, remaining: Math.floor(b.tokens), retryAfter: Math.ceil(retryAfter) };
}

export function getClientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('cf-connecting-ip') ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

export interface RateLimitResult { blocked: boolean; response?: Response; }

export function rateLimitGuard(req: Request, userId?: string, cost = 1): RateLimitResult {
  const ip = getClientIp(req);
  // Global concurrency guard
  if (globalThis.__rlConcurrency!.inFlight >= GLOBAL_CONCURRENCY_MAX) {
    return { blocked: true, response: build429('Global concurrency limit reached', 2) };
  }
  // IP limit
  const ipRes = take(globalThis.__rlBuckets!.ip, ip, IP_CAP, IP_CAP, cost);
  if (!ipRes.allowed) {
    return { blocked: true, response: build429('Too many requests (IP)', ipRes.retryAfter) };
  }
  // User limit
  if (userId) {
    const userRes = take(globalThis.__rlBuckets!.user, userId, USER_CAP, USER_CAP, cost);
    if (!userRes.allowed) {
      return { blocked: true, response: build429('Too many requests (User)', userRes.retryAfter) };
    }
  }
  globalThis.__rlConcurrency!.inFlight += 1;
  return { blocked: false };
}

export function releaseConcurrency() {
  globalThis.__rlConcurrency!.inFlight = Math.max(0, globalThis.__rlConcurrency!.inFlight - 1);
}

export async function enforceJsonBodySize(req: Request): Promise<Response | null> {
  const len = Number(req.headers.get('content-length') || 0);
  if (len && len > MAX_JSON_BODY_BYTES) {
    return build413();
  }
  return null;
}

function build429(msg: string, retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 429,
    headers: {
      'Content-Type': 'application/json',
      'Retry-After': String(retryAfterSeconds),
      'Cache-Control': 'no-store'
    }
  });
}

function build413(): Response {
  return new Response(JSON.stringify({ error: 'Request entity too large' }), {
    status: 413,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function withRateLimit<T>(req: Request, userId: string | undefined, fn: () => Promise<T>): Promise<T | Response> {
  const rl = rateLimitGuard(req, userId);
  if (rl.blocked) return rl.response!;
  try {
    return await fn();
  } finally {
    releaseConcurrency();
  }
}
