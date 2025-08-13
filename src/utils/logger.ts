// Lightweight logger with runtime toggle
// Enable via: localStorage.setItem('debug:chat', '1') or set VITE_DEBUG_CHAT=true

const isEnabled = () => {
  try {
    if (typeof window !== 'undefined') {
      const flag = window.localStorage.getItem('debug:chat');
      if (flag === '1' || flag === 'true') return true;
    }
  } catch {}
  // Fallback to env (only available at build-time)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const env = (import.meta as any)?.env;
  return !!env?.VITE_DEBUG_CHAT || env?.MODE === 'development';
};

const prefix = (level: string, scope?: string) =>
  scope ? `[${level}][${scope}]` : `[${level}]`;

export const logger = {
  debug: (message?: any, ...optionalParams: any[]) => {
    if (isEnabled()) console.debug(prefix('debug'), message, ...optionalParams);
  },
  info: (message?: any, ...optionalParams: any[]) => {
    if (isEnabled()) console.info(prefix('info'), message, ...optionalParams);
  },
  warn: (message?: any, ...optionalParams: any[]) => {
    if (isEnabled()) console.warn(prefix('warn'), message, ...optionalParams);
  },
  error: (message?: any, ...optionalParams: any[]) => {
    // Always log errors
    console.error(prefix('error'), message, ...optionalParams);
  },
  scoped: (scope: string) => ({
    debug: (message?: any, ...optionalParams: any[]) => {
      if (isEnabled()) console.debug(prefix('debug', scope), message, ...optionalParams);
    },
    info: (message?: any, ...optionalParams: any[]) => {
      if (isEnabled()) console.info(prefix('info', scope), message, ...optionalParams);
    },
    warn: (message?: any, ...optionalParams: any[]) => {
      if (isEnabled()) console.warn(prefix('warn', scope), message, ...optionalParams);
    },
    error: (message?: any, ...optionalParams: any[]) => {
      console.error(prefix('error', scope), message, ...optionalParams);
    },
  }),
};

export default logger;
