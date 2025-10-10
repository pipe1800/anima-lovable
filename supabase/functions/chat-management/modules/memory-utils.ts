/**
 * Shared utilities for memory normalization and hashing
 */ /** Normalize summary content for hashing: trim and collapse whitespace */ export function normalizeContentForHash(content) {
  return (content || '').trim().replace(/\s+/g, ' ');
}
/** Compute SHA-256 hex digest; returns null if crypto.subtle unavailable */ export async function computeSha256Hex(input) {
  try {
    // Deno deploy and modern runtimes expose global crypto.subtle
    const enc = new TextEncoder();
    // @ts-expect-error - subtle may not exist in all TS libs
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const data = enc.encode(input);
    const digest = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2, '0')).join('');
  } catch  {
    return null;
  }
}
/**
 * Normalize keywords: lowercase, trim, unicode-normalize, strip punctuation, de-duplicate
 * Optionally drop character name and common aliases like 'user'.
 */ export function normalizeKeywords(keywords = [], characterName) {
  const stop = new Set([
    'user'
  ]);
  if (characterName) stop.add(String(characterName).toLowerCase());
  const cleaned = Array.from(new Set((keywords || []).map((k)=>(k || '').normalize('NFKC').toLowerCase().trim()).map((k)=>k.replace(/[^\p{L}\p{N}\s_-]+/gu, '')) // keep letters, numbers, space, _-
  .filter((k)=>k.length > 0 && !stop.has(k))));
  // Cap to a reasonable number for storage/retrieval
  return cleaned.slice(0, 10);
}
/**
 * Convenience: normalize then compute hash.
 */ export async function computeContentHash(content, salt) {
  const normalized = normalizeContentForHash(content || '');
  const payload = salt ? `${salt}::${normalized}` : normalized;
  return computeSha256Hex(payload);
}
