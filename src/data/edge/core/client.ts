import { supabase, SUPABASE_API_URL } from '@/db/client';
import { EdgeFunctionError, EdgeCallOptions, EdgeCallResult } from './types';

async function getAuthToken(): Promise<string> {
  const { data: sessionData, error } = await supabase.auth.getSession();
  if (error || !sessionData?.session?.access_token) {
    throw new EdgeFunctionError('Authentication required', { code: 'AUTH_ERROR', status: 401 });
  }
  return sessionData.session.access_token;
}

function mapStatusToCode(status: number): string {
  if (status === 401) return 'AUTH_ERROR';
  if (status === 402) return 'INSUFFICIENT_CREDITS';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 408) return 'TIMEOUT';
  if (status >= 500) return 'SERVER_ERROR';
  return 'EDGE_ERROR';
}

export async function callEdgeFunction<T = any>( // eslint-disable-line @typescript-eslint/no-explicit-any
  name: string,
  body: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  options: EdgeCallOptions = {}
): Promise<EdgeCallResult<T>> {
  const attempts = options.retry?.attempts ?? 1;
  const backoffBase = options.retry?.backoffBaseMs ?? 300;
  const retryOn = options.retry?.retryOn || [500, 502, 503, 504];
  let attempt = 0;

  while (attempt < attempts) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeoutMs ?? 60000);
    try {
      const token = await getAuthToken();
      const resp = await fetch(`${SUPABASE_API_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': (supabase as any).rest?.headers?.apikey || (import.meta.env?.VITE_SUPABASE_ANON_KEY as string),
          ...(options.headers || {})
        },
        body: JSON.stringify(body),
        signal: options.signal || controller.signal
      });

      const text = await resp.text();
      let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (text) {
        try { json = JSON.parse(text); } catch { json = { raw: text }; }
      }

      if (!resp.ok) {
        // Retry logic
        if (attempt + 1 < attempts && retryOn.includes(resp.status)) {
          attempt++;
          await new Promise(r => setTimeout(r, backoffBase * Math.pow(2, attempt - 1))); // exp backoff
          continue;
        }
        const code = mapStatusToCode(resp.status);
        return { ok: false, status: resp.status, data: null, error: new EdgeFunctionError(json?.error || json?.message || `Edge function ${name} failed`, { code, status: resp.status, details: json }) };
      }

      return { ok: true, status: resp.status, data: json as T, error: null };
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (err?.name === 'AbortError') {
        return { ok: false, status: 408, data: null, error: new EdgeFunctionError('Request timed out', { code: 'TIMEOUT', status: 408 }) };
      }
      // Retry on network errors
      if (attempt + 1 < attempts) {
        attempt++;
        await new Promise(r => setTimeout(r, backoffBase * Math.pow(2, attempt - 1)));
        continue;
      }
      return { ok: false, status: err?.status || 0, data: null, error: err instanceof EdgeFunctionError ? err : new EdgeFunctionError(err?.message || 'Unknown edge error') };
    } finally {
      clearTimeout(timeoutId);
    }
  }
  return { ok: false, status: 0, data: null, error: new EdgeFunctionError('Exhausted retries', { code: 'RETRY_EXHAUSTED' }) };
}
