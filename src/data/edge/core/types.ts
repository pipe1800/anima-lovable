export interface EdgeCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  retry?: { attempts: number; backoffBaseMs?: number; retryOn?: number[] };
  headers?: Record<string, string>;
}

export interface EdgeCallResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: EdgeFunctionError | null;
}

export class EdgeFunctionError extends Error {
  code?: string;
  status?: number;
  details?: any; // eslint-disable-line @typescript-eslint/no-explicit-any
  constructor(message: string, init?: { code?: string; status?: number; details?: any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
    super(message);
    this.name = 'EdgeFunctionError';
    this.code = init?.code;
    this.status = init?.status;
    this.details = init?.details;
  }
}
