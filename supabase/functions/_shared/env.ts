// Centralized environment variable access with caching & optional defaults
// Usage: import { getEnv } from './env.ts';
// getEnv('OPENROUTER_API_KEY'); // throws if missing
// getEnv('LOG_LEVEL', { default: 'info', required: false });

const cache = new Map<string, string | undefined>();

interface GetEnvOptions { default?: string; required?: boolean; redact?: boolean }

export function getEnv(key: string, opts: GetEnvOptions = {}): string {
  if (cache.has(key)) {
    const v = cache.get(key);
    if (v == null) {
      if (opts.required !== false) throw new Error(`Missing required env: ${key}`);
      return opts.default ?? '';
    }
    return v;
  }
  let val: string | undefined;
  try { val = (globalThis as any).Deno?.env?.get(key); } catch { /* ignore */ }
  if (val == null && typeof process !== 'undefined') {
    val = (process as any).env?.[key];
  }
  cache.set(key, val);
  if ((val == null || val === '') && opts.required !== false && opts.default == null) {
    throw new Error(`Missing required env: ${key}`);
  }
  if ((val == null || val === '') && opts.default != null) return opts.default;
  return val ?? '';
}

export function tryEnv(key: string, def = ''): string {
  try { return getEnv(key, { default: def, required: false }); } catch { return def; }
}

export function getBooleanEnv(key: string, def = false): boolean {
  const v = tryEnv(key, def ? '1' : '');
  if (!v) return def;
  return /^(1|true|yes|on)$/i.test(v.trim());
}

export function getNumberEnv(key: string, def: number): number {
  const v = tryEnv(key, String(def));
  const n = Number(v);
  return isNaN(n) ? def : n;
}
