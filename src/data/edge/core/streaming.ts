import { supabase, SUPABASE_API_URL } from '@/db/client';
import { EdgeFunctionError } from './types';
import { StreamingMessageParser, parseSSEMessage } from '@/lib/streaming-utils';

export interface StreamingOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  mode?: 'smooth' | 'instant';
  onToken?: (text: string, aggregate: string) => void;
  onDone?: (final: string) => void;
  onEvent?: (evt: any) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function callStreamingEdgeFunction(
  name: string,
  body: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  opts: StreamingOptions = {}
): Promise<{ abort: () => void; done: Promise<string>; }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  const donePromise = (async () => {
    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error || !sessionData?.session?.access_token) throw new EdgeFunctionError('Authentication required', { code: 'AUTH_ERROR', status: 401 });
      const token = sessionData.session.access_token;

      const resp = await fetch(`${SUPABASE_API_URL}/functions/v1/${name}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': (supabase as any).rest?.headers?.apikey || (import.meta.env?.VITE_SUPABASE_ANON_KEY as string),
        },
        body: JSON.stringify(body),
        signal: opts.signal || controller.signal
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text();
        throw new EdgeFunctionError(text || `Streaming edge call failed (${resp.status})`, { status: resp.status });
      }
      const reader = resp.body.getReader();
      const parser = new StreamingMessageParser();
      let full = '';
      const mode = opts.mode || 'smooth';
      const scheduleAppend = async (text: string) => {
        if (!text) return;
        if (mode !== 'smooth') { full += text; opts.onToken?.(text, full); return; }
        const chunk = 24;
        for (let i = 0; i < text.length; i += chunk) {
          const part = text.slice(i, i + chunk);
          full += part;
          opts.onToken?.(part, full);
          await new Promise(r => setTimeout(r, 16));
        }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const dataLines = parser.parseChunk(value);
        for (const data of dataLines) {
          const obj = parseSSEMessage(data);
          if (!obj) continue;
          if (obj.done === true) {
            opts.onDone?.(full);
            return full;
          }
          if (typeof obj?.content === 'string') await scheduleAppend(obj.content);
          else if (obj?.choices?.[0]?.delta?.content) await scheduleAppend(obj.choices[0].delta.content as string);
          else opts.onEvent?.(obj);
        }
      }
      opts.onDone?.(full);
      return full;
    } finally {
      clearTimeout(timeoutId);
    }
  })();
  return { abort: () => controller.abort(), done: donePromise };
}
