import { supabase, SUPABASE_API_URL } from '@/db/client';
import { EdgeFunctionError } from './core/types';

export interface ParseCharacterCardOptions {
  bypassCache?: boolean;
  storeAvatar?: boolean;
  token?: string; // optional externally supplied token
  timeoutMs?: number;
}

export interface ParsedCharacterCard {
  id?: string;
  name?: string;
  description?: string;
  avatar_url?: string;
  [key: string]: any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function parseCharacterCardEdge(file: File, opts: ParseCharacterCardOptions = {}): Promise<ParsedCharacterCard> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 60000);
  try {
    const form = new FormData();
    form.append('file', file);
    if (opts.storeAvatar) form.append('store_avatar', 'true');
    if (opts.bypassCache) form.append('bypass_cache', 'true');

    let token = opts.token;
    if (!token) {
      const { data, error } = await supabase.auth.getSession();
      if (error || !data?.session?.access_token) throw new EdgeFunctionError('Authentication required', { code: 'AUTH_ERROR', status: 401 });
      token = data.session.access_token;
    }

    const resp = await fetch(`${SUPABASE_API_URL}/functions/v1/parse-character-card`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
      signal: controller.signal
    });

    if (!resp.ok) {
      let json: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
      try { json = await resp.json(); } catch {}
      throw new EdgeFunctionError(json?.error || `Parser error: ${resp.status}`, { code: json?.code, status: resp.status, details: json });
    }
    return resp.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export default parseCharacterCardEdge;
