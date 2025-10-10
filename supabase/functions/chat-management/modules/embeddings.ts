/**
 * Embeddings utility via OpenRouter
 */ const DEFAULT_EMBEDDING_MODEL = 'openai/text-embedding-3-small'; // 1536 dims
export async function getTextEmbedding(text) {
  try {
    const apiKey = globalThis.Deno?.env?.get('OPENROUTER_API_KEY') || (typeof process !== 'undefined' ? process.env.OPENROUTER_API_KEY : undefined);
    const model = globalThis.Deno?.env?.get('EMBEDDING_MODEL') || (typeof process !== 'undefined' ? process.env.EMBEDDING_MODEL : undefined) || DEFAULT_EMBEDDING_MODEL;
    if (!apiKey) {
      console.warn('Embeddings skipped: OPENROUTER_API_KEY not configured');
      return null;
    }
    const siteUrl = globalThis.Deno?.env?.get('SITE_URL') || (typeof process !== 'undefined' ? process.env.SITE_URL : undefined) || 'https://yourapp.com';
    const content = (text || '').slice(0, 8000);
    const resp = await fetch('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': siteUrl,
        'X-Title': 'AnimaChat-Embeddings'
      },
      body: JSON.stringify({
        model,
        input: content
      })
    });
    const contentType = resp.headers.get('content-type') || '';
    if (!resp.ok || !contentType.includes('application/json')) {
      // Read text body for diagnostics but limit preview
      let preview = '';
      try {
        preview = await resp.text();
      } catch (previewError) {
        console.warn('Failed to read embeddings error preview', previewError);
      }
      console.warn('Embeddings HTTP warning:', {
        status: resp.status,
        contentType,
        preview: preview.substring(0, 200)
      });
      return null;
    }
    const json = await resp.json();
    const vec = Array.isArray(json?.data) ? json.data[0]?.embedding : undefined;
    if (!Array.isArray(vec)) {
      console.warn('Embeddings response missing vector');
      return null;
    }
    return vec;
  } catch (e) {
    console.warn('Embeddings error (non-fatal):', e);
    return null;
  }
}
export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return -1;
  let dot = 0, na = 0, nb = 0;
  for(let i = 0; i < a.length; i++){
    const x = a[i] || 0;
    const y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return -1;
  return dot / denom;
}
