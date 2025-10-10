// Centralized logging redaction utilities
// Avoid leaking user provided content or API keys in logs.

function hashString(input: string): string {
  let h = 0;
  let i = 0;
  const len = input.length;
  while (i < len) { h = (Math.imul(31, h) + input.charCodeAt(i++)) | 0; }
  return ('00000000' + (h >>> 0).toString(16)).slice(-8);
}

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export function redactContent(value: unknown, opts?: { maxPreview?: number }): unknown {
  const maxPreview = opts?.maxPreview ?? 80;
  try {
    if (value == null) return value;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return {
        type: 'text',
        length: trimmed.length,
        hash: hashString(trimmed.slice(0, 500)),
        preview: trimmed.slice(0, maxPreview)
      };
    }
    if (Array.isArray(value)) {
      return value.map(v => redactContent(v, opts));
    }
    if (isRecord(value)) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        if (/key|secret|token|authorization/i.test(k)) {
          out[k] = maskPotentialKey(String(v || ''));
        } else {
          out[k] = redactContent(v, opts);
        }
      }
      return out;
    }
    return value;
  } catch {
    return { error: 'redaction_failed' };
  }
}

export function maskPotentialKey(k: string): string {
  if (!k) return '';
  const clean = k.replace(/Bearer\s+/i, '');
  if (clean.length <= 8) return '***';
  return clean.slice(0,4) + '****' + clean.slice(-4);
}

export function safeLog(label: string, payload: unknown) {
  try {
    console.log(label, JSON.stringify(redactContent(payload)));
  } catch (e) {
    console.log(label, '{"error":"failed_to_log"}');
  }
}

export function safeError(label: string, error: unknown, context?: unknown) {
  try {
    const base = error instanceof Error
      ? { message: error.message, name: error.name }
      : { message: String(error), name: 'Error' };
    console.error(label, JSON.stringify({ error: base, context: redactContent(context) }));
  } catch {
    console.error(label, '{"error":"failed_to_log"}');
  }
}
