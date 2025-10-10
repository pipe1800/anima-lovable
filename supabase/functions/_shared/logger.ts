// Lightweight environment-aware logger with level gating
// Usage: import { logger } from '../_shared/logger.ts';
// Set LOG_LEVEL env to one of: error,warn,info,debug,trace

import { tryEnv } from './env.ts';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug' | 'trace';

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3, trace: 4 };

const isLogLevel = (value: string): value is LogLevel => (value in ORDER);

function resolveLevel(): LogLevel {
  const raw = tryEnv('LOG_LEVEL', 'info').toLowerCase();
  return isLogLevel(raw) ? raw : 'info';
}

const active = resolveLevel();

function enabled(level: LogLevel) { return ORDER[level] <= ORDER[active]; }

function base(level: LogLevel, msg: string, meta?: unknown) {
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
  error: (m: string, o?: unknown) => base('error', m, o),
  warn:  (m: string, o?: unknown) => base('warn', m, o),
  info:  (m: string, o?: unknown) => base('info', m, o),
  debug: (m: string, o?: unknown) => base('debug', m, o),
  trace: (m: string, o?: unknown) => base('trace', m, o),
};

// Helper to wrap potentially noisy computations
export function debugLazy<T>(label: string, fn: () => T) {
  if (logger.isDebug()) {
    try {
      logger.debug(label, fn());
    } catch (error) {
      logger.warn(`${label}_failed`, error instanceof Error ? error.message : String(error));
    }
  }
}
