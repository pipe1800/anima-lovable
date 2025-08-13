// Supabase Edge Function: parse-character-card
// Accepts a PNG character card, extracts embedded JSON metadata from tEXt/zTXt/iTXt chunks,
// normalizes it to the creator form shape, optionally uploads avatar to Storage, and can persist.

import { authenticateUser, createCorsResponse, createErrorResponse } from "../_shared/auth.ts";
import { CORS_HEADERS } from "../types/interfaces.ts";

// Utility: read uint32 and chunk type
function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}
function readType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset],
    bytes[offset + 1],
    bytes[offset + 2],
    bytes[offset + 3],
  );
}

async function inflateToString(data: Uint8Array): Promise<string> {
  // Use Web DecompressionStream for zlib/deflate on Deno Edge
  const ds = new DecompressionStream("deflate");
  const stream = new Response(new Blob([data]).stream().pipeThrough(ds));
  const buf = new Uint8Array(await stream.arrayBuffer());
  return new TextDecoder().decode(buf);
}

// Extract textual data from PNG: tEXt, zTXt (deflate), iTXt (utf-8, optional deflate)
function extractPngTextualChunks(bytes: Uint8Array): Array<{ type: string; keyword: string; text: string }> {
  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIG[i]) return [];

  let offset = 8;
  const chunks: Array<{ type: string; keyword: string; text: string }> = [];

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = readType(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;

    if (type === "tEXt") {
      // keyword\0text
      const chunk = bytes.slice(dataStart, dataEnd);
      const nullPos = chunk.indexOf(0);
      if (nullPos > 0) {
        const keyword = new TextDecoder().decode(chunk.slice(0, nullPos));
        const text = new TextDecoder().decode(chunk.slice(nullPos + 1));
        chunks.push({ type, keyword, text });
      }
    } else if (type === "zTXt") {
      // keyword\0compressionMethod(1B) + compressed text
      const chunk = bytes.slice(dataStart, dataEnd);
      const nullPos = chunk.indexOf(0);
      if (nullPos > 0 && nullPos + 1 < chunk.length) {
        const keyword = new TextDecoder().decode(chunk.slice(0, nullPos));
        const compressionMethod = chunk[nullPos + 1];
        if (compressionMethod === 0) {
          const compressed = chunk.slice(nullPos + 2);
          // defer decompression to caller (async)
          chunks.push({ type, keyword, text: `__COMPRESSED__:${btoa(String.fromCharCode(...compressed))}` });
        }
      }
    } else if (type === "iTXt") {
      // keyword\0 compression_flag(1B) compression_method(1B) language_tag\0 translated_keyword\0 text
      const chunk = bytes.slice(dataStart, dataEnd);
      let p = 0;
      const readNullTerm = () => {
        const idx = chunk.indexOf(0, p);
        const out = idx >= 0 ? new TextDecoder().decode(chunk.slice(p, idx)) : new TextDecoder().decode(chunk.slice(p));
        p = idx >= 0 ? idx + 1 : chunk.length;
        return out;
      };
      const keyword = readNullTerm();
      if (p + 2 <= chunk.length) {
        const compressionFlag = chunk[p];
        const compressionMethod = chunk[p + 1];
        p += 2;
        // language tag and translated keyword
        const _languageTag = readNullTerm();
        const _translatedKeyword = readNullTerm();
        const remaining = chunk.slice(p);
        if (compressionFlag === 1 && compressionMethod === 0) {
          chunks.push({ type, keyword, text: `__COMPRESSED__:${btoa(String.fromCharCode(...remaining))}` });
        } else {
          const text = new TextDecoder().decode(remaining);
          chunks.push({ type, keyword, text });
        }
      }
    }

    offset = dataEnd + 4; // skip CRC
    if (type === "IEND") break;
  }
  return chunks;
}

async function decodeChunkText(entry: { type: string; keyword: string; text: string }): Promise<{ keyword: string; text: string }> {
  if (entry.text.startsWith("__COMPRESSED__:")) {
    const b64 = entry.text.substring("__COMPRESSED__:".length);
    // Convert base64 back to bytes
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = await inflateToString(bytes);
    return { keyword: entry.keyword, text };
  }
  return { keyword: entry.keyword, text: entry.text };
}

// Normalize character card data into app-friendly creator form shape
// deno-lint-ignore no-explicit-any
function normalizeToFormShape(raw: any) {
  // Handle v2 wrapper
  const data = (raw && raw.spec === 'chara_card_v2' && raw.data) ? raw.data : raw;

  const name = data.name || data.char_name || data.character?.name || '';

  // Short description: use only explicit short fields; do not derive from long description
  const candidateShorts: Array<string | undefined> = [
    data.short_description,
    data.tagline,
    data.title,
    data.data?.short_description,
    data.data?.tagline,
    data.data?.title,
  ];
  const shortDescription = (candidateShorts.find((v) => typeof v === 'string' && v.trim().length > 0) as string | undefined) || '';

  // Personality/definition text goes to core_personality (prefer explicit personality field, fallback to full description)
  const corePersonality = (data.personality || data.char_persona || data.data?.personality || '') || (data.description || data.data?.description || '');

  const scenario = data.scenario || data.world_scenario || data.data?.scenario || '';

  // Greeting and alternates
  const greeting = data.first_mes || data.greeting || data.char_greeting || data.data?.first_mes || data.data?.greeting || '';
  const alternate_greetings: string[] = Array.isArray(data.alternate_greetings)
    ? (data.alternate_greetings as unknown[]).filter((g: unknown) => typeof g === 'string').map((g: any) => g.trim()).filter(Boolean)
    : Array.isArray(data.data?.alternate_greetings)
      ? (data.data.alternate_greetings as unknown[]).filter((g: unknown) => typeof g === 'string').map((g: any) => g.trim()).filter(Boolean)
      : [];

  // Tags (ensure array of strings)
  const rawTags = Array.isArray(data.tags) ? data.tags
    : Array.isArray(data.data?.tags) ? data.data.tags
    : [];
  const tags: string[] = (rawTags as unknown[])
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter((t) => !!t);

  // Notes mapping
  const creatorNotes = data.creator_notes || data.data?.creator_notes || '';
  const characterNotes = data.system_prompt || data.data?.system_prompt || '';

  // Example dialogues
  const mes_example = data.mes_example || data.example_dialogue || data.example_messages || data.data?.mes_example || data.data?.example_dialogue || '';
  const example_dialogues = typeof mes_example === 'string' ? parseExampleDialogue(mes_example) : Array.isArray(data.example_dialogues) ? data.example_dialogues : [];

  return {
    formData: {
      name,
      avatar: '',
      title: '',
      description: shortDescription,
      chatMode: 'storytelling',
      personality: {
        core_personality: String(corePersonality || ''),
        tags,
        knowledge_base: '',
        scenario_definition: String(scenario || ''),
      },
      dialogue: {
        greeting: String(greeting || ''),
        example_dialogues,
        alternate_greetings,
      },
      notes: {
        character_notes: String(characterNotes || ''),
        creator_notes: String(creatorNotes || ''),
      },
      visibility: 'public',
      nsfw_enabled: false,
      default_persona_id: null,
      timeAwarenessEnabled: false,
    },
    vendor: detectVendor(raw),
    version: raw?.spec_version || raw?.version || null,
  };
}

function detectVendor(raw: any): 'tavern' | 'silly' | 'unknown' {
  if (!raw) return 'unknown';
  const spec = (raw.spec || raw.data?.spec || '').toLowerCase();
  if (spec.includes('chara_card')) return 'tavern';
  if (raw.extensions?.silly || raw.create_date || raw.chat) return 'silly';
  return 'unknown';
}

// Parse raw example dialogues similar to client utility
function parseExampleDialogue(dialogueString: string | undefined): Array<{ user: string; character: string }> {
  if (!dialogueString || typeof dialogueString !== 'string') return [];
  const dialogues: Array<{ user: string; character: string }> = [];
  const cleanedString = dialogueString
    .replace(/<START>/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();
  const blocks = cleanedString.split(/\n\n+/).filter((b) => b.trim());
  let currentUser = '';
  let currentChar = '';
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    for (const line of lines) {
      if (line.match(/^(\{\{user\}\}|User|You):/i)) {
        if (currentUser && currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentChar = '';
        }
        currentUser = line.replace(/^(\{\{user\}\}|User|You):/i, '').trim();
      } else if (line.match(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/)) {
        currentChar = line.replace(/^(\{\{char\}\}|Character|[A-Z][a-zA-Z]+):/, '').trim();
      } else if (line.trim()) {
        if (currentUser && !currentChar) {
          currentChar = line.trim();
        } else if (currentChar) {
          dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
          currentUser = line.trim();
          currentChar = '';
        }
      }
    }
  }
  if (currentUser && currentChar) dialogues.push({ user: currentUser.trim(), character: currentChar.trim() });
  if (dialogues.length === 0 && blocks.length >= 2) {
    for (let i = 0; i < blocks.length - 1; i += 2) {
      dialogues.push({ user: blocks[i].trim(), character: blocks[i + 1]?.trim() || '' });
    }
  }
  return dialogues;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function nsfwHeuristics(str: string): boolean {
  const s = str.toLowerCase();
  const patterns = [
    'nsfw', '18+', 'porn', 'sexual', 'explicit', 'nudity', 'erotic', 'xxx',
  ];
    return patterns.some(p => s.includes(p));
}

function buildModeration(formData: any) {
  const warnings: string[] = [];
  const flags: any = { nsfwDetected: false, oversizedFields: false };
  const texts = [
    formData.title || '',
    formData.description || '',
    formData.personality?.core_personality || '',
    formData.personality?.scenario_definition || '',
    formData.dialogue?.greeting || '',
  ].join(' \n ');
  if (nsfwHeuristics(texts) || (Array.isArray(formData.personality?.tags) && formData.personality.tags.some((t: string) => nsfwHeuristics(String(t))))) {
    flags.nsfwDetected = true;
    warnings.push('NSFW content detected heuristically.');
  }
  // Length checks
  const limits = {
    title: 150,
    description: 4000,
    greeting: 2000,
    scenario: 2000,
  };
  if ((formData.title || '').length > limits.title) warnings.push('Title is very long.');
  if ((formData.description || '').length > limits.description) warnings.push('Description is very long.');
  if ((formData.dialogue?.greeting || '').length > limits.greeting) warnings.push('Greeting is very long.');
  if ((formData.personality?.scenario_definition || '').length > limits.scenario) warnings.push('Scenario definition is very long.');
  flags.oversizedFields = warnings.some(w => /long/i.test(w));
  return { warnings, flags };
}

// Helper: get user's current plan name (defaults to Guest Pass if none)
async function getUserPlanName(userId: string, supabaseAdmin: any): Promise<string> {
  try {
    const { data: sub, error: subErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id, plan_id, status, created_at')
      .eq('user_id', userId)
      .in('status', ['active', 'trialing'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!subErr && sub?.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from('plans')
        .select('name')
        .eq('id', sub.plan_id)
        .maybeSingle();
      if (plan?.name) return plan.name as string;
    }
  } catch (_) {
    // ignore and fallback
  }
  return 'Guest Pass';
}

function isGuestPassPlan(planName: string | null | undefined): boolean {
  if (!planName) return true;
  const n = String(planName).toLowerCase();
  return n === 'guest pass' || n === 'the guest pass';
}

globalThis.Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { user, supabaseAdmin } = await authenticateUser(req);

    const contentType = req.headers.get('content-type') || '';
    let fileBytes: Uint8Array | null = null;
    let originalFilename = 'card.png';
    let uploadAvatar = false;
    let persist = false;
    let bypassCache = false;

    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return createErrorResponse('Missing file field', 400);
      originalFilename = file.name || originalFilename;
      uploadAvatar = form.get('store_avatar') === 'true';
      persist = form.get('persist') === 'true';
      bypassCache = form.get('bypass_cache') === 'true';
      const ab = await file.arrayBuffer();
      fileBytes = new Uint8Array(ab);
    } else {
      const body = await req.json().catch(() => ({}));
      uploadAvatar = !!body.store_avatar;
      persist = !!body.persist;
      bypassCache = !!body.bypass_cache;
      if (body.storage_bucket && body.storage_path) {
        const { data, error } = await supabaseAdmin.storage.from(String(body.storage_bucket)).download(String(body.storage_path));
        if (error || !data) return createErrorResponse('Failed to download from Storage', 400);
        const ab = await data.arrayBuffer();
        fileBytes = new Uint8Array(ab);
        originalFilename = body.storage_path.split('/').pop() || originalFilename;
      } else if (body.url) {
        const res = await fetch(String(body.url));
        if (!res.ok) return createErrorResponse('Failed to fetch URL', 400);
        const ab = await res.arrayBuffer();
        fileBytes = new Uint8Array(ab);
        originalFilename = (new URL(String(body.url))).pathname.split('/').pop() || originalFilename;
      } else if (body.base64) {
        const bin = atob(String(body.base64));
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        fileBytes = arr;
      } else {
        return createErrorResponse('Provide multipart file, {storage_bucket, storage_path}, {url}, or {base64}', 400);
      }
    }

    if (!fileBytes) return createErrorResponse('No file bytes', 400);

    const MAX_SIZE = 10 * 1024 * 1024;
    if (fileBytes.length > MAX_SIZE) return createErrorResponse('Payload too large', 413);
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (fileBytes[i] !== sig[i]) return createErrorResponse('Unsupported media type (PNG required)', 415);

    const hash = await sha256Hex(fileBytes);

    // Cache: check existing
    if (!bypassCache) {
      const { data: cached, error: cacheErr } = await supabaseAdmin
        .from('parsed_character_cards')
        .select('vendor, version, normalized, avatar_public_url')
        .eq('hash', hash)
        .maybeSingle();
      if (!cacheErr && cached && cached.normalized) {
        const formData = cached.normalized;
        const moderation = buildModeration(formData);
        // Append Guest Pass NSFW warning if applicable
        if (moderation.flags.nsfwDetected) {
          const planName = await getUserPlanName(user.id, supabaseAdmin);
          if (isGuestPassPlan(planName)) {
            moderation.warnings.push('Guest Pass models block NSFW content. This character may not work as expected on your current plan.');
          }
        }
        if (uploadAvatar && !cached.avatar_public_url) {
          // upload now and update cache
          const bucket = 'character-avatars';
          const filename = `${user.id}/${hash}-${Date.now()}.png`;
          const { error: upErr, data: upData } = await supabaseAdmin.storage.from(bucket).upload(filename, new Blob([fileBytes], { type: 'image/png' }), { contentType: 'image/png', upsert: false });
          if (!upErr && upData) {
            const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(upData.path);
            await supabaseAdmin.from('parsed_character_cards').update({ avatar_public_url: pub.publicUrl }).eq('hash', hash);
            formData.avatar = pub.publicUrl;
          }
        } else if (cached.avatar_public_url) {
          formData.avatar = cached.avatar_public_url;
        }
        return createCorsResponse({
          formData,
          meta: {
            vendor: cached.vendor,
            version: cached.version,
            filename: originalFilename,
            size: fileBytes.length,
            hash,
            avatar_url: formData.avatar || null,
            cached: true,
            warnings: moderation.warnings,
            flags: moderation.flags,
          },
          persisted: null,
          chunksScanned: 0,
        }, 200);
      }
    }

    // Extract and decode textual chunks
    const rawChunks = extractPngTextualChunks(fileBytes);
    const decodedChunks = await Promise.all(rawChunks.map(decodeChunkText));

    // Find candidate JSON metadata
    const candidates = decodedChunks.filter(({ keyword, text }) => {
      return /chara|character|json|metadata|ccv3|tavern|silly|card|data/i.test(keyword) || /^[\[{]/.test(text.trim());
    });

    let parsed: any = null;
    for (const c of candidates) {
      const text = c.text.trim();
      if (!text) continue;
      let maybe = text;
      // Try base64→JSON fallthrough
      try {
        if (!text.startsWith('{') && !text.startsWith('[')) {
          const decoded = atob(text);
          maybe = decoded;
        }
      } catch (_) {
        // not base64, leave as-is
      }
      try {
        parsed = JSON.parse(maybe);
        break;
      } catch (_) {
        // try next
      }
    }

    if (!parsed) {
      return createErrorResponse('No embedded metadata found in PNG textual chunks', 422);
    }

    const normalized = normalizeToFormShape(parsed);

    // Moderation/warnings
    const moderation = buildModeration(normalized.formData);
    // Append Guest Pass NSFW warning if applicable
    if (moderation.flags.nsfwDetected) {
      const planName = await getUserPlanName(user.id, supabaseAdmin);
      if (isGuestPassPlan(planName)) {
        moderation.warnings.push('Guest Pass models block NSFW content. This character may not work as expected on your current plan.');
      }
    }

    // Optional: upload avatar (original PNG) to Storage and attach URL
    let avatarPublicUrl: string | null = null;
    if (uploadAvatar) {
      const bucket = 'character-avatars';
      const filename = `${user.id}/${hash}-${Date.now()}.png`;
      const { error: upErr, data: upData } = await supabaseAdmin
        .storage
        .from(bucket)
        .upload(filename, new Blob([fileBytes], { type: 'image/png' }), {
          contentType: 'image/png',
          upsert: false,
        });
      if (!upErr && upData) {
        const { data: pub } = supabaseAdmin.storage.from(bucket).getPublicUrl(upData.path);
        avatarPublicUrl = pub.publicUrl;
        normalized.formData.avatar = avatarPublicUrl ?? '';
      }
    }

    // Upsert cache
    await supabaseAdmin
      .from('parsed_character_cards')
      .upsert({
        hash,
        vendor: normalized.vendor,
        version: normalized.version,
        normalized: normalized.formData,
        avatar_public_url: avatarPublicUrl || null,
      }, { onConflict: 'hash' });

    // Persist (unchanged)
    let persisted: any = null;
    if (persist) {
      // Persist character + definition using admin client
      const { data: character, error: charErr } = await supabaseAdmin
        .from('characters')
        .insert({
          creator_id: user.id,
          name: normalized.formData.name,
          short_description: normalized.formData.description,
          avatar_url: normalized.formData.avatar || avatarPublicUrl || null,
          tagline: normalized.formData.title || null,
          visibility: normalized.formData.visibility,
        })
        .select('*')
        .single();
      if (charErr || !character) return createErrorResponse(charErr?.message || 'Failed to create character', 500);

      const definition: any = {
        personality: normalized.formData.personality,
        dialogue: normalized.formData.dialogue,
        title: normalized.formData.title,
      };
      const { error: defErr } = await supabaseAdmin
        .from('character_definitions')
        .insert({
          character_id: character.id,
          personality_summary: JSON.stringify(definition),
          greeting: normalized.formData.dialogue.greeting,
          description: normalized.formData.personality.core_personality,
          scenario: normalized.formData.personality.scenario_definition || null,
        });
      if (defErr) {
        await supabaseAdmin.from('characters').delete().eq('id', character.id);
        return createErrorResponse(defErr.message, 500);
      }

      // Tags: map names to ids and insert relations
      const tags = normalized.formData.personality.tags || [];
      if (tags.length) {
        const { data: tagRows, error: tagErr } = await supabaseAdmin.from('tags').select('id,name').in('name', tags);
        if (!tagErr && tagRows && tagRows.length) {
          const relations = tagRows.map((t: any) => ({ character_id: character.id, tag_id: t.id }));
          await supabaseAdmin.from('character_tags').insert(relations);
        }
      }

      persisted = character;
    }

    return createCorsResponse({
      formData: normalized.formData,
      meta: {
        vendor: normalized.vendor,
        version: normalized.version,
        filename: originalFilename,
        size: fileBytes.length,
        hash,
        avatar_url: normalized.formData.avatar || null,
        cached: false,
        warnings: moderation.warnings,
        flags: moderation.flags,
      },
      persisted,
      chunksScanned: decodedChunks.length,
    }, 200);
  } catch (e) {
    console.error('parse-character-card error:', e);
    return createErrorResponse(typeof e === 'string' ? e : (e?.message || 'Server error'));
  }
});
