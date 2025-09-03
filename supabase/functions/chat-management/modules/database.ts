import type {
  SupabaseClient,
  Message,
  Character,
  CurrentContext,
  TemplateContext
} from '../types/streaming-interfaces.ts';
import type { GlobalChatSettings } from '../../_shared/settings-mapper.ts';

// --- Utility coercion helpers ---
function asString(u: any): string | undefined { return typeof u === 'string' ? u : u == null ? undefined : String(u); }
function asBool(u: any): boolean { return Boolean(u); }
function coerceMessage(row: any): Message {
  return {
    id: asString(row.id),
    chat_id: asString(row.chat_id) || '',
    author_id: row.author_id === null || typeof row.author_id === 'string' ? row.author_id : asString(row.author_id) || null,
    content: asString(row.content) || '',
    is_ai_message: asBool(row.is_ai_message),
    is_placeholder: asBool(row.is_placeholder),
    current_context: row.current_context || undefined,
    message_order: typeof row.message_order === 'number' ? row.message_order : 0,
    created_at: asString(row.created_at) || new Date().toISOString(),
    updated_at: asString(row.updated_at)
  };
}

// In-memory per-request character cache
const characterCache = new WeakMap<any, Map<string, any>>();

export async function fetchCharacterData(
  characterId: string,
  supabase: SupabaseClient,
  options?: { full?: boolean }
): Promise<Character & { greeting?: string | null; example_dialogs?: string | null; scenario?: string | null; personality_summary?: any }> {
  const full = !!options?.full;
  let cacheForClient = characterCache.get(supabase);
  if (!cacheForClient) { cacheForClient = new Map(); characterCache.set(supabase, cacheForClient); }
  const cacheKey = `${characterId}:${full ? 'full' : 'min'}`;
  if (cacheForClient.has(cacheKey)) return cacheForClient.get(cacheKey);

  // Prefer joined character_definitions (new canonical location for summary/greeting)
  const defCols = full
    ? 'id,name,creator_id,visibility,nsfw,tags,character_definitions(personality_summary,greeting,scenario,example_dialogs)'
    : 'id,name,creator_id,character_definitions(personality_summary,greeting)';
  let data: any = null; let error: any = null;
  try {
    const resp = await supabase
      .from('characters')
      .select(defCols)
      .eq('id', characterId)
      .maybeSingle();
    data = resp.data; error = resp.error;
  } catch (e) {
    error = e;
  }

  // Legacy fallback (older schema with columns directly on characters)
  if ((!data || error) && error?.message?.includes('column') ) {
    try {
      const legacyCols = full ? 'id,name,creator_id,personality_summary,greeting,scenario,example_dialogs' : 'id,name,creator_id,personality_summary,greeting';
      const legacy = await supabase
        .from('characters')
        .select(legacyCols)
        .eq('id', characterId)
        .maybeSingle();
      if (legacy.data) { data = legacy.data; error = null; }
    } catch {}
  }

  if (!data) throw new Error(`Character not found: ${characterId}`);

  // Normalize flattening
  const parsed: any = { id: data.id, name: data.name, creator_id: data.creator_id };
  const defs = (data as any).character_definitions || {};
  const ps = (data as any).personality_summary ?? defs.personality_summary ?? null;
  if (ps) {
    if (typeof ps === 'string') { try { parsed.personality_summary = JSON.parse(ps); } catch { parsed.personality_summary = ps; } }
    else parsed.personality_summary = ps;
  }
  parsed.greeting = (data as any).greeting ?? defs.greeting ?? null;
  if (full) {
    parsed.scenario = (data as any).scenario ?? defs.scenario ?? null;
    parsed.example_dialogs = (data as any).example_dialogs ?? defs.example_dialogs ?? null;
    parsed.visibility = (data as any).visibility ?? null;
    parsed.nsfw = (data as any).nsfw ?? null;
    parsed.tags = (data as any).tags ?? null;
  }

  cacheForClient.set(cacheKey, parsed);
  return parsed;
}

export async function fetchConversationHistory(
  chatId: string,
  supabase: SupabaseClient,
  options?: { limit?: number }
): Promise<Message[]> {
  const limit = options?.limit ?? 200;
  const { data, error } = await supabase
    .from('messages')
    .select('id,chat_id,author_id,content,is_ai_message,is_placeholder,current_context,message_order,created_at,updated_at')
    .eq('chat_id', chatId)
    .order('message_order', { ascending: true })
    .limit(limit);
  if (error) {
    console.error('Failed to fetch conversation history:', error);
    return [];
  }
  return (data || []).map(coerceMessage);
}

export async function fetchUserProfile(
  userId: string,
  supabase: SupabaseClient
): Promise<any> {
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('username, timezone')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('Profile error:', error);
    return null;
  }
  return profile;
}

export async function fetchUserGlobalSettings(
  userId: string,
  supabaseAdmin: SupabaseClient
): Promise<GlobalChatSettings | null> {
  const { data: settings, error } = await supabaseAdmin
    .from('user_global_chat_settings')
    .select(`
      dynamic_world_info,
      enhanced_memory,
      mood_tracking,
      clothing_inventory,
      location_tracking,
      time_and_weather,
      relationship_status,
      character_position,
      chain_of_thought,
      few_shot_examples,
      streaming_mode,
      font_size
    `)
    .eq('user_id', userId)
    .single();

  if (error) {
    console.error('Global settings error:', error);
    return null;
  }

  return settings as unknown as GlobalChatSettings;
}

export async function fetchUserCharacterSettings(
  userId: string,
  characterId: string,
  supabaseAdmin: SupabaseClient
): Promise<{ chat_mode: 'storytelling' | 'companion'; time_awareness_enabled: boolean } | null> {
  const { data: settings, error } = await supabaseAdmin
    .from('user_character_settings')
    .select('chat_mode, time_awareness_enabled')
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .single();

  if (error && error.code !== 'PGRST116') { // Not found error
    console.error('User character settings error:', error);
    return null;
  }

  // Return default values if no settings found
  if (!settings) return { chat_mode: 'storytelling', time_awareness_enabled: false };
  const s = settings as any;
  return {
    chat_mode: (s.chat_mode === 'companion' ? 'companion' : 'storytelling') as 'storytelling' | 'companion',
    time_awareness_enabled: Boolean(s.time_awareness_enabled)
  };
}

export async function fetchUserSelectedWorldInfo(
  userId: string,
  characterId: string,
  worldInfoId: string | null,
  supabase: SupabaseClient
): Promise<Array<{ keywords: string[]; entry_text: string }> | null> {
  console.log('🌍 fetchUserSelectedWorldInfo called with:', { 
    userId, 
    characterId, 
    worldInfoId,
    worldInfoIdType: typeof worldInfoId,
    worldInfoIdNull: worldInfoId === null,
    worldInfoIdUndefined: worldInfoId === undefined,
    worldInfoIdEmpty: worldInfoId === ''
  });

  if (!worldInfoId) {
    console.log('❌ No worldInfoId provided, returning null');
    return null;
  }

  console.log('🌍 Fetching world info entries for:', worldInfoId);

  // First, verify user has access to this world info (either owns it or has it in collection)
  const { data: worldInfoAccess, error: accessError } = await supabase
    .from('world_infos')
    .select('id, creator_id, name')
    .eq('id', worldInfoId)
    .single();

  console.log('🔍 World info access check:', { 
    worldInfoAccess, 
    accessError,
    worldInfoId 
  });

  if (!worldInfoAccess) {
    console.log('❌ World info not found:', worldInfoId);
    return null;
  }

  // Check if user owns the world info or has it in their collection
  const isOwner = worldInfoAccess.creator_id === userId;
  let hasAccess = isOwner;

  console.log('👤 Ownership check:', { 
    isOwner, 
    worldInfoCreatorId: worldInfoAccess.creator_id, 
    userId 
  });

  if (!isOwner) {
    const { data: userWorldInfo, error: collectionError } = await supabase
      .from('world_info_users')
      .select('id')
      .eq('user_id', userId)
      .eq('world_info_id', worldInfoId)
      .single();

    console.log('📚 Collection access check:', { 
      userWorldInfo, 
      collectionError 
    });

    hasAccess = !!userWorldInfo;
  }

  if (!hasAccess) {
    console.log('❌ User does not have access to world info:', worldInfoId);
    return null;
  }

  console.log('✅ User has access to world info:', worldInfoId);

  // Fetch world info entries
  const { data: entries, error } = await supabase
    .from('world_info_entries')
    .select('keywords, entry_text')
    .eq('world_info_id', worldInfoId);

  console.log('📝 World info entries query result:', { 
    entries, 
    error,
    entriesCount: entries?.length || 0,
  firstEntryKeywords: entries?.[0] && Array.isArray((entries as any)[0].keywords) ? (entries as any)[0].keywords : undefined,
  firstEntryText: typeof entries?.[0]?.entry_text === 'string' ? (entries as any)[0].entry_text.substring(0, 100) + '...' : undefined
  });

  if (error) {
    console.error('❌ Error fetching world info entries:', error);
    return null;
  }

  console.log(`✅ Fetched ${entries?.length || 0} world info entries`);
  
  // Log each entry for debugging
  entries?.forEach((entry: any, index: number) => {
    console.log(`📋 Entry ${index + 1}:`, {
      keywords: entry.keywords,
      textLength: entry.entry_text?.length || 0,
      textPreview: entry.entry_text?.substring(0, 50) + '...'
    });
  });
  // Coerce to expected shape safely
  return (entries || []).map((e: any) => ({
    keywords: Array.isArray(e.keywords) ? e.keywords.map(String) : [],
    entry_text: typeof e.entry_text === 'string' ? e.entry_text : ''
  }));
}

export async function fetchCharacterMemories(
  userId: string,
  characterId: string,
  supabase: SupabaseClient,
  opts?: { chatId?: string; includeAutoSummaries?: boolean; limitNonAuto?: number; limitAuto?: number; crossChat?: boolean }
): Promise<Array<{ id: string; summary_content: string; trigger_keywords: string[]; created_at: string; updated_at: string; last_injected_at: string | null; injection_count: number | null; content_hash: string | null; is_auto_summary?: boolean; embedding?: number[] | null }>> {
  console.log('🧠 Fetching character memories for:', { userId, characterId, opts });

  const limitNonAuto = opts?.limitNonAuto ?? 50;
  const limitAuto = opts?.limitAuto ?? 5;
  // Always allow auto summaries when requested; do not require chatId
  const includeAuto = !!opts?.includeAutoSummaries;
  const preferChatId = opts?.chatId || null;

  try {
  const queries: Array<Promise<{ data: any[] }>> = [];

    // Non-auto summaries (curated/manual) across all chats for this user-character pair
    queries.push(
      (async () => {
        const r = await supabase
          .from('character_memories')
          .select('id, summary_content, trigger_keywords, created_at, updated_at, last_injected_at, injection_count, content_hash, is_auto_summary, embedding')
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .eq('is_auto_summary', false)
          .order('updated_at', { ascending: false })
          .limit(limitNonAuto);
        return { data: r.data || [] };
      })()
    );

    // Auto summaries
    if (includeAuto) {
      const autoQueries: Promise<any>[] = [];

      // Prefer a few from the current chat if provided
      if (preferChatId) {
        autoQueries.push((async () => {
          const r = await supabase
            .from('character_memories')
            .select('id, summary_content, trigger_keywords, created_at, updated_at, last_injected_at, injection_count, content_hash, is_auto_summary, embedding')
            .eq('chat_id', preferChatId)
            .eq('user_id', userId)
            .eq('character_id', characterId)
            .eq('is_auto_summary', true)
            .order('created_at', { ascending: false })
            .limit(Math.min(limitAuto, 3));
          return { data: r.data || [] };
        })());
      }

      // Also fetch most recent across chats for this user-character pair
      autoQueries.push((async () => {
        const r = await supabase
          .from('character_memories')
          .select('id, summary_content, trigger_keywords, created_at, updated_at, last_injected_at, injection_count, content_hash, is_auto_summary, embedding')
          .eq('user_id', userId)
          .eq('character_id', characterId)
          .eq('is_auto_summary', true)
          .order('created_at', { ascending: false })
          .limit(limitAuto);
        return { data: r.data || [] };
      })());

      queries.push(Promise.all(autoQueries).then((results) => {
        // Flatten and dedupe by id or content_hash
        const flat = results.map(r => (r?.data || [])).flat();
        const seen = new Set<string>();
        const deduped = flat.filter((m: any) => {
          const key = m.id || m.content_hash || `${m.summary_content?.slice(0, 64)}:${m.created_at}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        // Cap to limitAuto overall
        return { data: deduped.slice(0, limitAuto) };
      }));
    }

    const results = await Promise.all(queries);

    const nonAuto = results[0].data || [];
    const auto = includeAuto ? (results[1]?.data || []) : [];

    const memories = [...nonAuto, ...auto];

    console.log(`✅ Fetched memories -> nonAuto: ${nonAuto.length}, auto: ${auto.length}`);

    // Debug preview
  memories.forEach((memory: any, index: number) => {
      console.log(`🧠 Memory ${index + 1}:`, {
        id: memory.id,
        isAuto: memory.is_auto_summary,
        keywords: memory.trigger_keywords,
        hasEmbedding: Array.isArray(memory.embedding),
        contentLength: memory.summary_content?.length || 0,
        contentPreview: memory.summary_content?.substring(0, 100) + '...',
        createdAt: memory.created_at,
        updatedAt: memory.updated_at,
        lastInjectedAt: memory.last_injected_at,
        injectionCount: memory.injection_count,
        contentHash: memory.content_hash?.substring(0, 8)
      });
    });
  return memories as any;
  } catch (error) {
    console.error('❌ Unexpected error fetching character memories:', error);
    return [];
  }
}

export async function fetchSelectedPersona(
  selectedPersonaId: string | undefined,
  userId: string,
  supabase: SupabaseClient
): Promise<{ name?: string; bio?: string; lore?: string } | null> {
  if (!selectedPersonaId) return null;

  const { data: persona } = await supabase
    .from('personas')
    .select('name, bio, lore')
    .eq('id', selectedPersonaId)
    .eq('user_id', userId)
    .single();

  return persona ? {
    name: asString((persona as any).name),
    bio: asString((persona as any).bio),
    lore: asString((persona as any).lore)
  } : null;
}

/**
 * Get the user's last used persona ID from their most recent chat
 */
async function getUserLastUsedPersona(userId: string, supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('chats')
    .select('selected_persona_id')
    .eq('user_id', userId)
    .not('selected_persona_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return asString((data as any).selected_persona_id) || null;
}

/**
 * Get the user's default persona (first created persona if no recent usage)
 */
async function getUserDefaultPersona(userId: string, supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from('personas')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return asString((data as any).id) || null;
}

/**
 * Get the best persona for a new chat based on user's default persona
 */
export async function getBestPersonaForNewChat(userId: string, characterId: string, supabase: SupabaseClient): Promise<string | null> {
  // Get the user's default persona from their profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('default_persona_id')
    .eq('id', userId)
    .single();

  if (profileError || !profile?.default_persona_id) {
    console.log('🎭 No user default persona found, trying user\'s first persona');
    // Fallback to user's first created persona
    const { data: persona, error: personaError } = await supabase
      .from('personas')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (personaError || !persona) {
      console.log('🎭 No user personas found');
      return null;
    }

  return asString(persona.id) || null;
  }

  // Verify the persona still exists and belongs to this user
  const { data: persona, error: personaError } = await supabase
    .from('personas')
    .select('id')
    .eq('id', profile.default_persona_id)
    .eq('user_id', userId)
    .single();

  if (personaError || !persona) {
    console.log('🎭 User default persona not found or doesn\'t belong to user');
    return null;
  }

  console.log('🎭 Using user default persona:', profile.default_persona_id);
  return asString(profile.default_persona_id) || null;
}

/**
 * Fetch the selected persona for a chat from the chat table
 */
export async function fetchChatSelectedPersona(
  chatId: string,
  userId: string,
  supabase: SupabaseClient
): Promise<{ name?: string; bio?: string; lore?: string } | null> {
  const { data: chat } = await supabase
    .from('chats')
    .select(`
      selected_persona_id,
      personas:selected_persona_id(
        name,
        bio,
        lore
      )
    `)
    .eq('id', chatId)
    .eq('user_id', userId)
    .single();

  if (!chat || !(chat as any).personas) return null;
  const p = (chat as any).personas;
  return {
    name: asString(p.name),
    bio: asString(p.bio),
    lore: asString(p.lore)
  };
}

// Consolidated persona + profile bootstrap accessor to reduce duplicate queries.
// Precedence:
// 1. Chat-selected persona (if chatId provided and persona exists)
// 2. Explicit selectedPersonaId (validated against user)
// 3. User profile's default_persona_id (if exists & valid)
// 4. First created persona (fallback)
// Returns { profile: { username, timezone }, persona: { name, bio, lore } | null }
export async function getUserPersonaProfile(options: {
  supabase: SupabaseClient;
  userId: string;
  chatId?: string;
  explicitPersonaId?: string | null;
}): Promise<{ profile: { username?: string; timezone?: string } | null; persona: { name?: string; bio?: string; lore?: string } | null }> {
  const { supabase, userId, chatId, explicitPersonaId } = options;
  // Run profile + chat persona + explicit persona lookup in parallel; fallback persona queries only if needed.
  const [profileRes, chatPersonaRes, explicitPersonaRes] = await Promise.all([
    supabase.from('profiles').select('username, timezone, default_persona_id').eq('id', userId).single(),
    chatId ? supabase.from('chats').select(`selected_persona_id, personas:selected_persona_id(name,bio,lore)`).eq('id', chatId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
    explicitPersonaId ? supabase.from('personas').select('name,bio,lore,id,user_id').eq('id', explicitPersonaId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null })
  ]);

  const profileData: any = profileRes.data || null;
  // Priority 1: chat-selected
  let persona: any = chatPersonaRes?.data?.personas || null;
  // Priority 2: explicit selection
  if (!persona && explicitPersonaRes?.data) persona = explicitPersonaRes.data;
  let defaultPersonaId: string | null = profileData?.default_persona_id || null;

  // Priority 3: default persona id from profile
  if (!persona && defaultPersonaId) {
    const { data: defPersona } = await supabase.from('personas').select('name,bio,lore').eq('id', defaultPersonaId).eq('user_id', userId).maybeSingle();
    if (defPersona) persona = defPersona;
  }
  // Priority 4: first created persona
  if (!persona) {
    const { data: firstPersona } = await supabase.from('personas').select('name,bio,lore').eq('user_id', userId).order('created_at',{ ascending: true }).limit(1).maybeSingle();
    if (firstPersona) persona = firstPersona;
  }
  const personaOut = persona ? { name: persona.name, bio: persona.bio, lore: persona.lore } : null;
  const profileOut = profileData ? { username: profileData.username, timezone: profileData.timezone } : null;
  return { profile: profileOut, persona: personaOut };
}

export async function fetchCurrentContext(
  userId: string,
  chatId: string,
  characterId: string,
  supabase: SupabaseClient
): Promise<CurrentContext> {
  const { data: contextData, error } = await supabase
    .from('chat_context')
    .select('current_context')
    .eq('user_id', userId)
    .eq('chat_id', chatId)
    .eq('character_id', characterId)
    .maybeSingle();

  let raw = contextData?.current_context || null;

  // Fallback: if no stored context, attempt to derive from character_definitions (initial_addon_context in personality_summary)
  if ((!raw || Object.values(raw).every(v => v == null)) && characterId) {
    try {
      const { data: def } = await supabase
        .from('character_definitions')
        .select('personality_summary')
        .eq('character_id', characterId)
        .maybeSingle();
      if (def?.personality_summary) {
        let parsed: any = null;
        try { parsed = typeof def.personality_summary === 'string' ? JSON.parse(def.personality_summary) : def.personality_summary; } catch {}
        if (parsed?.initial_addon_context_enabled && parsed?.initial_addon_context && typeof parsed.initial_addon_context === 'object') {
          raw = parsed.initial_addon_context;
          console.log('🌱 Fallback initial_addon_context loaded from character_definitions');
        }
      }
    } catch (fbErr) {
      console.warn('⚠️ Fallback initial_addon_context load failed', fbErr);
    }
  }

  if (error && !raw) {
    console.log('No context found in chat_context table for chat:', chatId);
    return {} as any;
  }

  const pick = (k: string) => (typeof raw?.[k] === 'string' && raw[k].trim() && raw[k] !== 'No context') ? raw[k].trim() : null;
  const normalized: any = {
    moodTracking: pick('moodTracking') || pick('mood'),
    clothingInventory: pick('clothingInventory') || pick('clothing'),
    locationTracking: pick('locationTracking') || pick('location'),
    timeAndWeather: pick('timeAndWeather') || pick('time_weather'),
    relationshipStatus: pick('relationshipStatus') || pick('relationship'),
    characterPosition: pick('characterPosition') || pick('character_position'),
    enchantmentStatus: pick('enchantmentStatus') || pick('enchantment_status'),
    itemInventory: pick('itemInventory') || pick('item_inventory')
  };
  Object.keys(normalized).forEach(k => normalized[k] == null && delete normalized[k]);
  console.log('✅ Fetched & normalized context:', { raw, normalized });
  return normalized;
}

// Bootstrap snapshot accessor
export async function fetchChatBootstrapSnapshot(options: {
  supabase: SupabaseClient;
  userId: string;
  chatId: string;
  characterId: string;
  includeMemories?: boolean;
  memoryLimit?: number;
}): Promise<{
  profile: { username?: string; timezone?: string } | null;
  persona: { name?: string; bio?: string; lore?: string } | null;
  character: { id: string; name: string; greeting?: string | null; personality_summary?: any } | null;
  context: any;
  relationship: any;
  latest_ai_message: { id: string; content: string; message_order: number; created_at: string } | null;
  memories?: Array<{ id: string; summary_content: string; trigger_keywords: string[]; created_at: string }> | null;
}> {
  const { supabase, userId, chatId, characterId, includeMemories, memoryLimit } = options;
  try {
    const { data, error } = await supabase.rpc('get_chat_bootstrap_snapshot', {
      p_user_id: userId,
      p_chat_id: chatId,
      p_character_id: characterId,
      p_include_memories: !!includeMemories,
      p_memory_limit: memoryLimit ?? 20
    });
    if (error) {
      console.warn('bootstrap.snapshot.rpc.error', error.message);
      throw new Error('Failed bootstrap snapshot');
    }
    if (!data || typeof data !== 'object') throw new Error('Empty snapshot');
    const rawCtx = (data as any).context?.current_context || null;
    const pick2 = (k: string) => (typeof rawCtx?.[k] === 'string' && rawCtx[k].trim() && rawCtx[k] !== 'No context') ? rawCtx[k].trim() : null;
    const normalizedContext: any = rawCtx ? {
      moodTracking: pick2('moodTracking') || pick2('mood'),
      clothingInventory: pick2('clothingInventory') || pick2('clothing'),
      locationTracking: pick2('locationTracking') || pick2('location'),
      timeAndWeather: pick2('timeAndWeather') || pick2('time_weather'),
      relationshipStatus: pick2('relationshipStatus') || pick2('relationship'),
      characterPosition: pick2('characterPosition') || pick2('character_position'),
      enchantmentStatus: pick2('enchantmentStatus') || pick2('enchantment_status'),
      itemInventory: pick2('itemInventory') || pick2('item_inventory')
    } : {};
    Object.keys(normalizedContext).forEach(k => normalizedContext[k] == null && delete normalizedContext[k]);
    return {
      profile: (data as any).profile || null,
      persona: (data as any).persona || null,
      character: (data as any).character || null,
      context: normalizedContext,
      relationship: (data as any).relationship || null,
      latest_ai_message: (data as any).latest_ai_message || null,
      memories: (data as any).memories || null
    };
  } catch (e) {
    console.warn('bootstrap.snapshot.error', (e as Error).message);
    return { profile: null, persona: null, character: null, context: {}, relationship: null, latest_ai_message: null, memories: null };
  }
}

export async function getNextMessageOrder(
  chatId: string,
  supabase: SupabaseClient
): Promise<number> {
  const { data: lastMessage } = await supabase
    .from('messages')
    .select('message_order')
    .eq('chat_id', chatId)
    .order('message_order', { ascending: false })
    .limit(1)
    .single();

  const order = typeof lastMessage?.message_order === 'number' ? lastMessage.message_order : 0;
  return order + 1;
}

export async function saveUserMessage(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  message: string,
  messageOrder: number
): Promise<Message> {
  const { data: userMessage, error } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      author_id: userId,
      content: message,
      is_ai_message: false,
      message_order: messageOrder,
      created_at: new Date().toISOString()
    })
  .select('*')
    .single();

  if (error) {
    console.error('Failed to save user message:', error);
    throw new Error('Failed to save user message');
  }

  return coerceMessage(userMessage);
}

export async function saveCharacterMessage(
  supabase: SupabaseClient,
  userId: string,
  characterId: string,
  chatId: string,
  message: string,
  currentContext: CurrentContext,
  messageOrder?: number
): Promise<Message> {
  // Simplified: always insert new AI message (placeholder flow removed)
  const { data: messageData, error: messageError } = await supabase
    .from('messages')
    .insert({
      chat_id: chatId,
      author_id: null,
      content: message,
      is_ai_message: true,
      current_context: currentContext,
      message_order: messageOrder || 1,
      created_at: new Date().toISOString()
    })
    .select('*')
    .single();
  if (messageError) {
    console.error('Error saving character message:', messageError);
    throw new Error('Failed to save character message');
  }
  return coerceMessage(messageData);
}

export async function updateChatLastActivity(
  supabase: SupabaseClient,
  chatId: string,
  characterId: string
): Promise<void> {
  const timestamp = new Date().toISOString();
  
  // Update chat last_message_at
  await supabase
    .from('chats')
    .update({ last_message_at: timestamp })
    .eq('id', chatId);

  // Update character last_activity
  await supabase
    .from('characters')
    .update({ last_activity: timestamp })
    .eq('id', characterId);
}

export function buildTemplateReplacer(context: TemplateContext) {
  return (content: string): string => {
    if (!content) return content;
    const { userName = 'User', charName = 'Character' } = context;
    return content
      .replace(/\{\{user\}\}/g, userName)
      .replace(/\{\{char\}\}/g, charName);
  };
}

export async function getLatestAutoSummary(
  characterId: string,
  supabase: SupabaseClient
): Promise<{ name: string; summary_content: string; created_at: string; id: string } | null> {
  console.log('🤖 Fetching latest auto-summary for character:', {
    characterId: characterId,
    characterIdType: typeof characterId,
    characterIdValue: characterId,
    isUndefined: characterId === undefined,
    isStringUndefined: characterId === 'undefined'
  });

  // Add validation to prevent UUID errors
  if (!characterId || characterId === 'undefined' || typeof characterId !== 'string') {
    console.warn('⚠️ Invalid characterId for auto-summary fetch, skipping:', characterId);
    return null;
  }

  try {
    const { data: summary, error } = await supabase
      .from('character_memories')
      .select('id, name, summary_content, created_at')
      .eq('character_id', characterId)
      .eq('is_auto_summary', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('❌ Error fetching auto-summary:', error);
      return null;
    }

    if (summary) {
      console.log('✅ Found latest auto-summary:', {
        id: summary.id,
        name: summary.name,
        createdAt: summary.created_at,
      });
    } else {
      console.log('🤷 No auto-summary found for character:', characterId);
    }

  return summary as any;
  } catch (error) {
    console.error('❌ Unexpected error fetching auto-summary:', error);
    return null;
  }
}

export async function fetchMessagesForSummary(
  chatId: string,
  supabase: SupabaseClient,
  limit: number = 100 // Fetch a good number of recent messages for token analysis
): Promise<Message[]> {
  console.log(`📚 Fetching last ${limit} messages for summary generation for chat:`, chatId);

  const { data: messages, error } = await supabase
    .from('messages')
    .select('content, is_ai_message, created_at')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false }) // Get the most recent ones
    .limit(limit);

  if (error) {
    console.error('❌ Error fetching messages for summary:', error);
    return [];
  }

  // The messages are fetched in descending order, so we need to reverse them
  // to get the correct chronological order for the summary.
  const chronologicalMessages = (messages || []).reverse().map((m: any) => ({
    chat_id: chatId,
    author_id: null,
    content: String(m.content ?? ''),
    is_ai_message: Boolean(m.is_ai_message),
    message_order: 0, // not selected here
    created_at: String(m.created_at || new Date().toISOString())
  })) as Message[];

  console.log(`✅ Fetched ${chronologicalMessages.length} messages for summary.`);
  return chronologicalMessages;
}

export async function fetchContextRecency(
  supabase: SupabaseClient,
  chatId: string,
  userId: string,
  characterId: string
): Promise<{ updatedAt: string | null }>{
  const { data, error } = await supabase
    .from('chat_context')
    .select('updated_at')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .eq('character_id', characterId)
    .maybeSingle();
  if (error || !data) return { updatedAt: null };
  return { updatedAt: (data as any).updated_at as string };
}
