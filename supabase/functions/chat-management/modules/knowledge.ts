import type { SupabaseClient } from '../types/streaming-interfaces.ts';

const EMBEDDING_MODEL_PROVIDER = 'openai';
const EMBEDDING_MODEL_NAME = 'text-embedding-ada-002';

type KnowledgeScope = 'chat' | 'character' | 'world' | 'user' | 'global';

interface KnowledgeSpaceRow {
  id: string;
  scope: KnowledgeScope;
  owner_user_id: string;
  character_id?: string | null;
  chat_id?: string | null;
  world_info_id?: string | null;
  name?: string | null;
}

interface KnowledgeChunkRow {
  id: string;
  chunk_index: number;
  content: string | null;
  token_count?: number | null;
  embeddings?: Array<{
    vector: number[] | null;
    model_id: string;
  }> | null;
}

interface KnowledgeMetadata {
  token_count?: number;
  input_token_cost?: number;
  manual?: boolean;
  [key: string]: unknown;
}

interface KnowledgeEntryRow {
  id: string;
  space_id: string;
  entry_type: string;
  author_id: string | null;
  content: string | null;
  keywords?: string[] | null;
  message_count?: number | null;
  ai_sequence_start?: number | null;
  ai_sequence_end?: number | null;
  injection_count?: number | null;
  last_injected_at?: string | null;
  content_hash?: string | null;
  title?: string | null;
  short_summary?: string | null;
  metadata?: KnowledgeMetadata | null;
  created_at: string;
  updated_at: string;
  space?: KnowledgeSpaceRow | null;
  chunks?: KnowledgeChunkRow[] | null;
}

export interface MemoryRecord {
  id: string;
  summary_content: string;
  trigger_keywords: string[];
  message_count: number | null;
  ai_sequence_start: number | null;
  ai_sequence_end: number | null;
  injection_count: number;
  last_injected_at: string | null;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  is_auto_summary: boolean;
  chat_id: string | null;
  character_id: string | null;
  user_id: string | null;
  name: string | null;
  embedding?: number[] | null;
  metadata?: KnowledgeMetadata | null;
  input_token_cost?: number | null;
  space_scope: KnowledgeScope;
  space_id: string;
}

interface FetchOptions {
  limit?: number;
  ascending?: boolean;
  orderBy?: 'created_at' | 'updated_at' | 'message_count';
}

const embeddingsCache: Map<string, string> = new Map();

function cacheKeyForClient(supabase: SupabaseClient) {
  try {
    const url = (supabase as unknown as { rest?: { url?: string } }).rest?.url ?? '';
    return `${url}|${EMBEDDING_MODEL_PROVIDER}|${EMBEDDING_MODEL_NAME}`;
  } catch {
    return `${EMBEDDING_MODEL_PROVIDER}|${EMBEDDING_MODEL_NAME}`;
  }
}

async function getEmbeddingModelId(supabase: SupabaseClient): Promise<string> {
  const key = cacheKeyForClient(supabase);
  if (embeddingsCache.has(key)) {
    return embeddingsCache.get(key)!;
  }
  const { data, error } = await supabase
    .from('embedding_models')
    .select('id')
    .eq('provider', EMBEDDING_MODEL_PROVIDER)
    .eq('model_name', EMBEDDING_MODEL_NAME)
    .maybeSingle();
  if (error || !data) {
    throw new Error(`Embedding model ${EMBEDDING_MODEL_PROVIDER}/${EMBEDDING_MODEL_NAME} not configured: ${error?.message}`);
  }
  embeddingsCache.set(key, data.id);
  return data.id;
}

function coerceString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value == null) return null;
  return String(value);
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v) => typeof v === 'string') as string[];
}

function normalizeVector(row?: KnowledgeChunkRow | null): number[] | null {
  if (!row?.embeddings || row.embeddings.length === 0) return null;
  const vec = row.embeddings.find((e) => Array.isArray(e.vector))?.vector;
  if (!Array.isArray(vec)) return null;
  return vec.map((num) => (typeof num === 'number' ? num : Number(num) || 0));
}

function mapEntry(row: KnowledgeEntryRow): MemoryRecord {
  const space = row.space ?? null;
  const chunks = (row.chunks ?? []).slice().sort((a, b) => (a.chunk_index ?? 0) - (b.chunk_index ?? 0));
  const primaryChunk = chunks[0] ?? null;
  const metadata: KnowledgeMetadata = row.metadata ?? {};
  return {
    id: row.id,
    space_id: row.space_id,
    summary_content: coerceString(row.content) ?? '',
    trigger_keywords: coerceStringArray(row.keywords),
    message_count: typeof row.message_count === 'number' ? row.message_count : null,
    ai_sequence_start: typeof row.ai_sequence_start === 'number' ? row.ai_sequence_start : null,
    ai_sequence_end: typeof row.ai_sequence_end === 'number' ? row.ai_sequence_end : null,
    injection_count: typeof row.injection_count === 'number' ? row.injection_count : 0,
    last_injected_at: coerceString(row.last_injected_at),
    content_hash: coerceString(row.content_hash),
    created_at: coerceString(row.created_at) ?? new Date().toISOString(),
    updated_at: coerceString(row.updated_at) ?? new Date().toISOString(),
    is_auto_summary: row.entry_type === 'summary',
    chat_id: coerceString(space?.chat_id),
    character_id: coerceString(space?.character_id),
    user_id: coerceString(space?.owner_user_id) ?? (row.author_id ? String(row.author_id) : null),
    name: coerceString(row.title) ?? coerceString(row.short_summary),
    embedding: normalizeVector(primaryChunk),
    metadata,
    input_token_cost: typeof metadata?.input_token_cost === 'number' ? metadata.input_token_cost : null,
    space_scope: (space?.scope as KnowledgeScope) ?? 'chat',
    space_id: row.space_id
  };
}

async function fetchEntries(
  supabase: SupabaseClient,
  params: {
    spaceIds: string[];
    entryTypes: string[];
    filters?: Record<string, unknown>;
    options?: FetchOptions;
  }
): Promise<MemoryRecord[]> {
  if (!params.spaceIds.length) return [];

  let query = supabase
    .from('knowledge_entries')
    .select(`
      id,
      space_id,
      entry_type,
      author_id,
      content,
      keywords,
      message_count,
      ai_sequence_start,
      ai_sequence_end,
      injection_count,
      last_injected_at,
      content_hash,
      title,
      short_summary,
      metadata,
      created_at,
      updated_at,
      space:knowledge_spaces!inner (
        id,
        scope,
        owner_user_id,
        character_id,
        chat_id,
        world_info_id
      ),
      chunks:knowledge_chunks (
        id,
        chunk_index,
        content,
        token_count,
        embeddings:knowledge_embeddings (
          vector,
          model_id
        )
      )
    `)
    .in('space_id', params.spaceIds)
    .in('entry_type', params.entryTypes);

  const orderBy = params.options?.orderBy ?? 'updated_at';
  const ascending = params.options?.ascending ?? false;
  query = query.order(orderBy, { ascending });
  if (params.options?.limit && params.options.limit > 0) {
    query = query.limit(params.options.limit);
  }

  if (params.filters) {
    for (const [key, value] of Object.entries(params.filters)) {
      if (value === undefined) continue;
      query = query.eq(key, value as never);
    }
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch knowledge entries: ${error.message}`);
  }
  return (data ?? []).map(mapEntry);
}

async function fetchSpaces(
  supabase: SupabaseClient,
  filters: Record<string, unknown>,
  scopes: KnowledgeScope[] = ['chat', 'character']
): Promise<KnowledgeSpaceRow[]> {
  let query = supabase
    .from('knowledge_spaces')
    .select('id, scope, owner_user_id, character_id, chat_id, world_info_id, name')
    .in('scope', scopes);

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    query = query.eq(key, value as never);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch knowledge spaces: ${error.message}`);
  }
  return data ?? [];
}

async function ensureChatSpace(
  supabase: SupabaseClient,
  params: { ownerId: string; characterId: string; chatId: string; createIfMissing?: boolean }
): Promise<KnowledgeSpaceRow | null> {
  const { ownerId, characterId, chatId } = params;
  const { data, error } = await supabase
    .from('knowledge_spaces')
    .select('id, scope, owner_user_id, character_id, chat_id, world_info_id, name')
    .eq('owner_user_id', ownerId)
    .eq('character_id', characterId)
    .eq('chat_id', chatId)
    .eq('scope', 'chat')
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to resolve chat knowledge space: ${error.message}`);
  }
  if (data) return data;
  if (!params.createIfMissing) return null;

  const insertName = `chat:${chatId.slice(0, 8)}`;
  const { data: inserted, error: insertError } = await supabase
    .from('knowledge_spaces')
    .insert({
      scope: 'chat',
      owner_user_id: ownerId,
      character_id: characterId,
      chat_id: chatId,
      visibility: 'private',
      name: insertName,
      metadata: {}
    })
    .select('id, scope, owner_user_id, character_id, chat_id, world_info_id, name')
    .single();

  if (insertError) {
    throw new Error(`Failed to create chat knowledge space: ${insertError.message}`);
  }
  return inserted;
}

async function ensureCharacterSpace(
  supabase: SupabaseClient,
  params: { ownerId: string; characterId: string; createIfMissing?: boolean }
): Promise<KnowledgeSpaceRow | null> {
  const { ownerId, characterId } = params;
  const { data, error } = await supabase
    .from('knowledge_spaces')
    .select('id, scope, owner_user_id, character_id, chat_id, world_info_id, name')
    .eq('owner_user_id', ownerId)
    .eq('character_id', characterId)
    .is('chat_id', null)
    .eq('scope', 'character')
    .maybeSingle();
  if (error && error.code !== 'PGRST116') {
    throw new Error(`Failed to resolve character knowledge space: ${error.message}`);
  }
  if (data) return data;
  if (!params.createIfMissing) return null;

  const insertName = `character:${characterId.slice(0, 8)}`;
  const { data: inserted, error: insertError } = await supabase
    .from('knowledge_spaces')
    .insert({
      scope: 'character',
      owner_user_id: ownerId,
      character_id: characterId,
      visibility: 'private',
      name: insertName,
      metadata: {}
    })
    .select('id, scope, owner_user_id, character_id, chat_id, world_info_id, name')
    .single();

  if (insertError) {
    throw new Error(`Failed to create character knowledge space: ${insertError.message}`);
  }
  return inserted;
}

async function upsertChunk(
  supabase: SupabaseClient,
  entryId: string,
  content: string,
  tokenCount?: number | null
): Promise<KnowledgeChunkRow> {
  const { data: existing, error: fetchError } = await supabase
    .from('knowledge_chunks')
    .select('id')
    .eq('entry_id', entryId)
    .eq('chunk_index', 0)
    .maybeSingle();

  if (fetchError && fetchError.code !== 'PGRST116') {
    throw new Error(`Failed to fetch existing knowledge chunk: ${fetchError.message}`);
  }

  if (existing) {
    const { data, error } = await supabase
      .from('knowledge_chunks')
      .update({
        content,
        token_count: tokenCount ?? null
      })
      .eq('id', existing.id)
      .select('id, chunk_index, content, token_count')
      .single();
    if (error) throw new Error(`Failed to update knowledge chunk: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from('knowledge_chunks')
    .insert({
      entry_id: entryId,
      chunk_index: 0,
      content,
      token_count: tokenCount ?? null
    })
    .select('id, chunk_index, content, token_count')
    .single();
  if (error) throw new Error(`Failed to insert knowledge chunk: ${error.message}`);
  return data;
}

async function upsertEmbedding(
  supabase: SupabaseClient,
  chunkId: string,
  vector: number[] | null
): Promise<void> {
  if (!vector || !Array.isArray(vector) || vector.length === 0) {
    return;
  }
  const modelId = await getEmbeddingModelId(supabase);
  const { error } = await supabase
    .from('knowledge_embeddings')
    .upsert({
      chunk_id: chunkId,
      model_id: modelId,
      vector
    });
  if (error) {
    throw new Error(`Failed to upsert embedding: ${error.message}`);
  }
}

export async function updateEntryEmbedding(
  supabase: SupabaseClient,
  params: { entryId: string; content: string; embeddingVector: number[] | null; tokenCount?: number | null }
): Promise<void> {
  const chunk = await upsertChunk(supabase, params.entryId, params.content, params.tokenCount ?? null);
  await upsertEmbedding(supabase, chunk.id, params.embeddingVector ?? null);
  const status = params.embeddingVector && params.embeddingVector.length > 0 ? 'ready' : 'pending';
  const { error } = await supabase
    .from('knowledge_entries')
    .update({
      embedding_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', params.entryId);
  if (error) {
    throw new Error(`Failed to update embedding status: ${error.message}`);
  }
}

export async function fetchManualMemories(
  supabase: SupabaseClient,
  params: { userId: string; characterId: string; chatId?: string | null; limit?: number }
): Promise<MemoryRecord[]> {
  const { userId, characterId } = params;
  const scopes: KnowledgeScope[] = params.chatId ? ['chat'] : ['chat', 'character'];
  const spaces = await fetchSpaces(supabase, { owner_user_id: userId, character_id: characterId }, scopes);
  if (!spaces.length) return [];

  const filteredSpaceIds = params.chatId
    ? spaces.filter((s) => s.chat_id === params.chatId).map((s) => s.id)
    : spaces.map((s) => s.id);

  if (!filteredSpaceIds.length) return [];

  const entries = await fetchEntries(supabase, {
    spaceIds: filteredSpaceIds,
    entryTypes: ['memory', 'note'],
    options: {
      limit: params.limit ?? 50,
      orderBy: 'updated_at',
      ascending: false
    }
  });

  return entries.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

export async function fetchAutoSummariesForChat(
  supabase: SupabaseClient,
  params: { userId?: string; characterId: string; chatId: string; limit?: number }
): Promise<MemoryRecord[]> {
  const { characterId, chatId, userId } = params;
  const filters: Record<string, unknown> = {
    chat_id: chatId,
    character_id: characterId
  };
  if (userId) filters.owner_user_id = userId;
  const spaces = await fetchSpaces(supabase, filters, ['chat']);
  if (!spaces.length) return [];

  const entries = await fetchEntries(supabase, {
    spaceIds: spaces.map((s) => s.id),
    entryTypes: ['summary'],
    options: {
      limit: params.limit ?? 50,
      orderBy: 'created_at',
      ascending: false
    }
  });
  return entries;
}

export async function fetchAutoSummariesAcrossChats(
  supabase: SupabaseClient,
  params: { userId: string; characterId: string; limit?: number }
): Promise<MemoryRecord[]> {
  const spaces = await fetchSpaces(
    supabase,
    { owner_user_id: params.userId, character_id: params.characterId },
    ['chat']
  );
  if (!spaces.length) return [];
  const entries = await fetchEntries(supabase, {
    spaceIds: spaces.map((s) => s.id),
    entryTypes: ['summary'],
    options: {
      limit: params.limit ?? 20,
      orderBy: 'created_at',
      ascending: false
    }
  });
  return entries;
}

export async function fetchLatestSummaryForCharacter(
  supabase: SupabaseClient,
  params: { userId?: string; characterId: string; chatId?: string | null }
): Promise<MemoryRecord | null> {
  const filters: Record<string, unknown> = { character_id: params.characterId };
  if (params.userId) filters.owner_user_id = params.userId;
  if (params.chatId) filters.chat_id = params.chatId;

  const spaces = await fetchSpaces(
    supabase,
    filters,
    params.chatId ? ['chat'] : ['chat', 'character']
  );
  if (!spaces.length) return null;

  const entries = await fetchEntries(supabase, {
    spaceIds: spaces.map((s) => s.id),
    entryTypes: ['summary'],
    options: {
      limit: 1,
      orderBy: 'created_at',
      ascending: false
    }
  });

  return entries[0] ?? null;
}

export async function listSummaryMessageCounts(
  supabase: SupabaseClient,
  params: { characterId?: string; chatId: string; userId?: string }
): Promise<number[]> {
  const filters: Record<string, unknown> = {
    chat_id: params.chatId
  };
  if (params.characterId) filters.character_id = params.characterId;
  if (params.userId) filters.owner_user_id = params.userId;
  const spaces = await fetchSpaces(supabase, filters, ['chat']);
  if (!spaces.length) return [];

  const { data, error } = await supabase
    .from('knowledge_entries')
    .select('message_count')
    .in('space_id', spaces.map((s) => s.id))
    .eq('entry_type', 'summary')
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(`Failed to list summary message counts: ${error.message}`);
  }
  return (data ?? [])
    .map((row) => (typeof row.message_count === 'number' ? row.message_count : null))
    .filter((mc): mc is number => typeof mc === 'number');
}

export async function findSummaryByMessageCount(
  supabase: SupabaseClient,
  params: { characterId: string; chatId: string; messageCount: number; userId?: string }
): Promise<MemoryRecord | null> {
  const filters: Record<string, unknown> = {
    character_id: params.characterId,
    chat_id: params.chatId
  };
  if (params.userId) filters.owner_user_id = params.userId;
  const spaces = await fetchSpaces(supabase, filters, ['chat']);
  if (!spaces.length) return null;

  const entries = await fetchEntries(supabase, {
    spaceIds: spaces.map((s) => s.id),
    entryTypes: ['summary'],
    filters: { message_count: params.messageCount },
    options: {
      limit: 1,
      orderBy: 'created_at',
      ascending: false
    }
  });
  return entries[0] ?? null;
}

export async function findSummaryByHash(
  supabase: SupabaseClient,
  params: { characterId: string; chatId: string; contentHash: string; userId?: string }
): Promise<MemoryRecord | null> {
  const filters: Record<string, unknown> = {
    character_id: params.characterId,
    chat_id: params.chatId
  };
  if (params.userId) filters.owner_user_id = params.userId;
  const spaces = await fetchSpaces(supabase, filters, ['chat']);
  if (!spaces.length) return null;

  const entries = await fetchEntries(supabase, {
    spaceIds: spaces.map((s) => s.id),
    entryTypes: ['summary'],
    filters: { content_hash: params.contentHash },
    options: {
      limit: 1,
      orderBy: 'created_at',
      ascending: false
    }
  });
  return entries[0] ?? null;
}

export async function insertSummary(
  supabase: SupabaseClient,
  params: {
    userId: string;
    characterId: string;
    chatId: string;
    content: string;
    keywords: string[];
    messageCount: number | null;
    aiSequenceStart: number | null;
    aiSequenceEnd: number | null;
    contentHash: string | null;
    name?: string | null;
    embeddingVector?: number[] | null;
    metadata?: KnowledgeMetadata;
  }
): Promise<MemoryRecord> {
  const space = await ensureChatSpace(supabase, {
    ownerId: params.userId,
    characterId: params.characterId,
    chatId: params.chatId,
    createIfMissing: true
  });
  if (!space) {
    throw new Error('Unable to resolve chat knowledge space for summary insert');
  }

  const payload = {
    space_id: space.id,
    entry_type: 'summary',
    author_id: params.userId,
    content: params.content,
    keywords: params.keywords,
    message_count: params.messageCount,
    ai_sequence_start: params.aiSequenceStart,
    ai_sequence_end: params.aiSequenceEnd,
    injection_count: 0,
    last_injected_at: null,
    content_hash: params.contentHash,
    title: params.name ?? null,
    metadata: params.metadata ?? {},
    embedding_status: params.embeddingVector ? 'ready' : 'pending'
  };

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert(payload)
    .select(`
      id,
      space_id,
      entry_type,
      author_id,
      content,
      keywords,
      message_count,
      ai_sequence_start,
      ai_sequence_end,
      injection_count,
      last_injected_at,
      content_hash,
      title,
      metadata,
      created_at,
      updated_at,
      space:knowledge_spaces!inner(
        id,
        scope,
        owner_user_id,
        character_id,
        chat_id,
        world_info_id
      )
    `)
    .single();

  if (error) {
    throw new Error(`Failed to insert summary: ${error.message}`);
  }

  const chunk = await upsertChunk(supabase, data.id, params.content, params.metadata?.token_count ?? null);
  await upsertEmbedding(supabase, chunk.id, params.embeddingVector ?? null);

  const record = mapEntry({
    ...data,
    chunks: [
      {
        ...chunk,
        embeddings: params.embeddingVector ? [{ vector: params.embeddingVector, model_id: await getEmbeddingModelId(supabase) }] : []
      }
    ]
  });
  return record;
}

export async function updateSummary(
  supabase: SupabaseClient,
  summaryId: string,
  params: {
    content: string;
    keywords: string[];
    messageCount: number | null;
    aiSequenceStart: number | null;
    aiSequenceEnd: number | null;
    contentHash: string | null;
    name?: string | null;
    metadata?: KnowledgeMetadata;
    embeddingVector?: number[] | null;
  }
): Promise<void> {
  const updatePayload = {
    content: params.content,
    keywords: params.keywords,
    message_count: params.messageCount,
    ai_sequence_start: params.aiSequenceStart,
    ai_sequence_end: params.aiSequenceEnd,
    content_hash: params.contentHash,
    title: params.name ?? null,
    metadata: params.metadata ?? {},
    embedding_status: params.embeddingVector ? 'ready' : 'pending',
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('knowledge_entries')
    .update(updatePayload)
    .eq('id', summaryId);
  if (error) {
    throw new Error(`Failed to update summary: ${error.message}`);
  }

  const chunk = await upsertChunk(supabase, summaryId, params.content, params.metadata?.token_count ?? null);
  await upsertEmbedding(supabase, chunk.id, params.embeddingVector ?? null);
}

export async function upsertManualMemory(
  supabase: SupabaseClient,
  params: {
    userId: string;
    characterId: string;
    chatId: string;
    content: string;
    keywords: string[];
    messageCount: number | null;
    contentHash: string | null;
    metadata?: KnowledgeMetadata;
  }
): Promise<void> {
  const space = await ensureChatSpace(supabase, {
    ownerId: params.userId,
    characterId: params.characterId,
    chatId: params.chatId,
    createIfMissing: true
  });
  if (!space) {
    throw new Error('Unable to resolve chat knowledge space for manual memory');
  }

  const { data: existing, error: selectError } = await supabase
    .from('knowledge_entries')
    .select('id')
    .eq('space_id', space.id)
    .eq('entry_type', 'memory')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selectError && selectError.code !== 'PGRST116') {
    throw new Error(`Failed to query existing manual memory: ${selectError.message}`);
  }

  const payload = {
    space_id: space.id,
    entry_type: 'memory',
    author_id: params.userId,
    content: params.content,
    keywords: params.keywords,
    message_count: params.messageCount,
    content_hash: params.contentHash,
    metadata: {
      ...(params.metadata ?? {}),
      input_token_cost: params.metadata?.input_token_cost ?? params.metadata?.credit_cost ?? null
    },
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { error } = await supabase
      .from('knowledge_entries')
      .update(payload)
      .eq('id', existing.id);
    if (error) {
      throw new Error(`Failed to update manual memory: ${error.message}`);
    }
    await upsertChunk(supabase, existing.id, params.content, params.metadata?.token_count ?? null);
    return;
  }

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert(payload)
    .select('id')
    .single();
  if (error) {
    throw new Error(`Failed to insert manual memory: ${error.message}`);
  }
  await upsertChunk(supabase, data.id, params.content, params.metadata?.token_count ?? null);
}

export async function fetchWorldKnowledgeEntries(
  supabase: SupabaseClient,
  worldInfoId: string
): Promise<Array<{ keywords: string[]; entry_text: string }>> {
  const spaces = await fetchSpaces(
    supabase,
    { world_info_id: worldInfoId },
    ['world']
  );
  if (!spaces.length) return [];

  const entries = await fetchEntries(supabase, {
    spaceIds: spaces.map((s) => s.id),
    entryTypes: ['world_fact', 'note', 'rule'],
    options: {
      orderBy: 'created_at',
      ascending: true
    }
  });

  return entries.map((entry) => ({
    keywords: entry.trigger_keywords ?? [],
    entry_text: entry.summary_content
  }));
}

export async function userHasWorldInfoAccess(
  supabase: SupabaseClient,
  params: { worldInfoId: string; userId: string }
): Promise<boolean> {
  const { data, error } = await supabase
    .from('world_infos')
    .select('id, creator_id, visibility')
    .eq('id', params.worldInfoId)
    .maybeSingle();
  if (error || !data) return false;
  if (data.creator_id === params.userId) return true;
  if (data.visibility === 'public' || data.visibility === 'unlisted') return true;

  // Check if user reacted to this world info (like/favorite/bookmark)
  const { data: reaction, error: reactionError } = await supabase
    .from('user_reactions')
    .select('id')
    .eq('target_type', 'world')
    .eq('target_id', params.worldInfoId)
    .eq('user_id', params.userId)
    .maybeSingle();
  if (reactionError && reactionError.code !== 'PGRST116') {
    console.warn('userHasWorldInfoAccess.reactionError', reactionError.message);
  }
  return !!reaction;
}
