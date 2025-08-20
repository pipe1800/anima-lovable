// Lightweight environment-aware logger with level gating
// Usage: import { logger } from '../_shared/logger.ts';
// Set LOG_LEVEL env to one of: error,warn,info,debug,trace

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

function resolveLevel(): LogLevel {
  try {
    const raw = (globalThis as any).Deno?.env?.get('LOG_LEVEL') || (typeof process !== 'undefined' ? process.env.LOG_LEVEL : '') || 'info';
    const lvl = raw.toLowerCase() as LogLevel;
    return (lvl in ORDER) ? lvl : 'info';
  } catch {
    return 'info';
  }
}

const active = resolveLevel();

function enabled(level: LogLevel) { return ORDER[level] <= ORDER[active]; }

function base(level: LogLevel, msg: string, meta?: any) {
  if (!enabled(level)) return;
  if (meta !== undefined) {
    // Avoid serializing extremely large strings
    if (typeof meta === 'string' && meta.length > 4000) {
      console.log(msg, { length: meta.length, head: meta.slice(0,500) + '...', truncated: true });
    } else {
      console.log(msg, meta);
    }
  } else {
    console.log(msg);
  }
}

export const logger = {
  level: active,
  isDebug: () => enabled('debug'),
  isTrace: () => enabled('trace'),
  error: (m: string, o?: any) => base('error', m, o),
  warn:  (m: string, o?: any) => base('warn', m, o),
  info:  (m: string, o?: any) => base('info', m, o),
  debug: (m: string, o?: any) => base('debug', m, o),
  trace: (m: string, o?: any) => base('trace', m, o),
};

// Helper to wrap potentially noisy computations
export function debugLazy(label: string, fn: () => any) {
  if (logger.isDebug()) {
    try { logger.debug(label, fn()); } catch (e) { logger.warn(label + '_failed', String(e)); }
  }
}
