import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { QueryClient } from '@tanstack/react-query';

// Direct table-specific types avoid the generic helper requiring two parameters
type PersonaRow = Database['public']['Tables']['personas']['Row'];
type PersonaInsertRow = Database['public']['Tables']['personas']['Insert'];
type PersonaUpdateRow = Database['public']['Tables']['personas']['Update'];

// Simple in-memory caches (per browser tab) to suppress duplicate network calls
// TTL keeps data reasonably fresh without hammering backend while user idles.
const PERSONA_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes
interface CacheEntry<T> { value: T; expires: number }
const personaByIdCache = new Map<string, CacheEntry<any>>();
let userPersonasCache: CacheEntry<any[]> | null = null;

const pendingListRef: { promise: Promise<any[]> | null } = { promise: null };
const pendingByIdMap = new Map<string, Promise<any>>();

export type Persona = PersonaRow;
export type PersonaInsert = PersonaInsertRow;
export type PersonaUpdate = PersonaUpdateRow;

const DEFAULT_AVATAR = '/default_avatar.jpg';

let lastFetchTs = 0;
const MIN_FETCH_INTERVAL = 750; // ms

export async function createPersona(userId: string, persona: Omit<PersonaInsert, 'user_id'>) {
  userPersonasCache = null; personaByIdCache.clear();
  if (!userId) throw new Error('User must be authenticated to create a persona');
  const { data, error } = await supabase
    .from('personas')
    .insert([{ ...persona, avatar_url: (persona as any).avatar_url || DEFAULT_AVATAR, user_id: userId }])
    .select()
    .single();
  if (error) throw error; return data;
}

let externalQueryClient: QueryClient | null = null;
export const registerPersonaQueryClient = (qc: QueryClient) => { externalQueryClient = qc; };

export async function getUserPersonas(userId: string, forceRefresh = false) {
  // Bootstrap snapshot fallback (preferred) unless forceRefresh explicitly requested
  try {
    if (!forceRefresh) {
      const { bootstrapStore } = await import('@/state/bootstrap-store');
      if (bootstrapStore.loaded && bootstrapStore.userId === userId && bootstrapStore.personas?.length) {
        return bootstrapStore.personas as any[];
      }
    }
  } catch { /* ignore dynamic import errors */ }
  const now = Date.now();
  if (!userId) return [];
  if (!forceRefresh && userPersonasCache && userPersonasCache.expires > now) return userPersonasCache.value;
  if (!forceRefresh && pendingListRef.promise) return pendingListRef.promise;
  const p = (async () => {
    const { data, error } = await supabase
      .from('personas')
      .select('id,name,bio,lore,avatar_url,updated_at,created_at,user_id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    console.log('[personas] Fetched list from network', { count: data?.length, ts: now });
    if (error) throw error;
    const list = data || [];
    userPersonasCache = { value: list, expires: now + PERSONA_CACHE_TTL_MS };
    list.forEach(p => personaByIdCache.set(p.id, { value: p, expires: now + PERSONA_CACHE_TTL_MS }));
    const rqKey = ['personas', userId];
    if (externalQueryClient) externalQueryClient.setQueryData(rqKey, list);
    // Also sync bootstrap store if loaded but personas empty (rare race)
    try {
      const { bootstrapStore, bootstrapActions } = await import('@/state/bootstrap-store');
      if (bootstrapStore.loaded && bootstrapStore.userId === userId && (!bootstrapStore.personas || !bootstrapStore.personas.length)) {
        bootstrapActions.hydrate({ ...(bootstrapStore as any), personas: list });
      }
    } catch {/* ignore */}
    return list;
  })();
  pendingListRef.promise = p; try { return await p; } finally { pendingListRef.promise = null; }
}

export async function updatePersona(id: string, updates: PersonaUpdate) {
  const { data, error } = await supabase
    .from('personas')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  // Refresh caches for this id & list
  const now = Date.now();
  personaByIdCache.set(id, { value: data, expires: now + PERSONA_CACHE_TTL_MS });
  userPersonasCache = null; // force refetch list next time to reflect ordering
  return data;
}

export async function deletePersona(id: string) {
  const { error } = await supabase
    .from('personas')
    .delete()
    .eq('id', id);
  if (error) throw error;
  personaByIdCache.delete(id);
  userPersonasCache = null;
}

export async function getPersonaById(id: string, forceRefresh = false) {
  const now = Date.now();
  // If list fetch in flight, await it first to leverage seeding
  if (pendingListRef.promise) {
    try { await pendingListRef.promise; } catch { /* ignore */ }
  }
  const cachedRQ = externalQueryClient?.getQueryData(['persona', id]) as any;
  if (cachedRQ && !forceRefresh) return cachedRQ;
  const cached = personaByIdCache.get(id);
  if (!forceRefresh && cached && cached.expires > now) return cached.value;
  if (!forceRefresh && pendingByIdMap.has(id)) return pendingByIdMap.get(id)!;
  const prom = (async () => {
    const { data, error } = await supabase
      .from('personas')
      .select('id,name,bio,lore,avatar_url,updated_at,created_at,user_id')
      .eq('id', id)
      .single();
    console.log('[personas] Fetched persona by id from network', { id, ts: now });
    if (externalQueryClient) externalQueryClient.setQueryData(['persona', id], data);
    if (error) throw error;
    personaByIdCache.set(id, { value: data, expires: now + PERSONA_CACHE_TTL_MS });
    return data;
  })();
  pendingByIdMap.set(id, prom);
  try { return await prom; } finally { pendingByIdMap.delete(id); }
}