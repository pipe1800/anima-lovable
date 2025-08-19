// BootstrapStore Implementation (initial scaffold)
// NOTE: This is an initial non-reactive scaffold. Hooks & full integration to follow.

import { UserSnapshotV2, BootstrapState, BootstrapActions, BootstrapStore } from '@/types/snapshot'
import { supabase } from '@/integrations/supabase/client'
import React, { useEffect, useSyncExternalStore, useCallback } from 'react'

// Current supported snapshot versions (newest first)
const CURRENT_SNAPSHOT_VERSION = 3;
const SUPPORTED_SNAPSHOT_VERSIONS: number[] = [3, 2];

// Internal singleton state
const state: BootstrapState = {
  snapshotVersion: null,
  generatedAt: null,
  userId: null,
  loading: false,
  loaded: false,
  error: null,
  profile: null,
  subscription: null,
  credits: null,
  settings: null,
  personas: [],
  characters: [],
  recentChats: [],
  favoriteCharacterIds: [],
  tags: [],
  stats: { total_chats: 0, total_characters: 0, total_personas: 0, total_favorites: 0 },
  defaultPersona: null,
  // segment version counters for granular invalidation
  creditsVersion: 0 as any,
  subscriptionVersion: 0 as any,
  profileVersion: 0 as any,
  settingsVersion: 0 as any,
  personasVersion: 0 as any,
  charactersVersion: 0 as any,
  favoritesVersion: 0 as any,
  chatsVersion: 0 as any,
};

// Simple listeners for pub/sub (React integration will subscribe via a bridge)
const listeners = new Set<() => void>();
const notify = () => { listeners.forEach(l => { try { l(); } catch (e) { console.error('Bootstrap listener error', e); } }); };

const persistKey = (userId: string, version: number) => `bootstrap_snapshot_${userId}_v${version}`;

let hydratePromise: Promise<void> | null = null;

// RPC fetcher for snapshot v2 (expects server rpc name get_user_snapshot_v2 or falls back)
export async function fetchUserSnapshotV2(): Promise<UserSnapshotV2> {
  const client: any = supabase;
  const { data, error } = await client.rpc('get_user_snapshot_v2');
  if (error) {
    throw new Error(`snapshot_v2_failed: ${error.message || error.code || 'unknown error'}`);
  }
  return data as unknown as UserSnapshotV2;
}

// Attempt sessionStorage hydration (sync) before network
function tryHydrateFromCache(userId: string | null) {
  // TEMP: disable cache usage to avoid stale subscription/credits discrepancies
  return false;
}

const recalcDerived = () => {
  if (state.profile?.default_persona_id) {
    const p = state.personas.find(p => p.id === state.profile!.default_persona_id);
    state.defaultPersona = p ? { id: p.id, name: p.name, avatar_url: p.avatar_url } : null;
  } else {
    state.defaultPersona = null;
  }
};

const persistSnapshotCurrent = () => {
  try {
    if (!state.userId) return;
    const version = state.snapshotVersion || 3;
    const snapshotLike = {
      version,
      generated_at: new Date().toISOString(),
      user_id: state.userId,
      profile: state.profile,
      subscription: state.subscription,
      credits: state.credits || { balance: 0 },
      user_global_chat_settings: state.settings,
      personas: state.personas,
      characters: state.characters,
      recent_chats: state.recentChats,
      favorite_character_ids: state.favoriteCharacterIds,
      tags: state.tags,
      stats: state.stats
    } as any;
    sessionStorage.setItem(persistKey(state.userId, version), JSON.stringify(snapshotLike));
  } catch {/* ignore */}
};

const actions: BootstrapActions = {
  hydrate(snapshot: UserSnapshotV2) {
    state.snapshotVersion = snapshot.version;
    state.generatedAt = snapshot.generated_at;
    state.userId = snapshot.user_id;
    state.profile = snapshot.profile;
    // Normalize subscription status if present
    let sub = snapshot.subscription as any;
    if (sub && typeof sub.status === 'string') {
      const allowed = ['active','past_due','canceled','trialing'];
      if (!allowed.includes(sub.status)) sub.status = 'active';
    }
    state.subscription = sub;
    state.credits = snapshot.credits;
    state.settings = snapshot.user_global_chat_settings;
    state.personas = snapshot.personas || [];
    state.characters = snapshot.characters || [];
    state.recentChats = snapshot.recent_chats || [];
    state.favoriteCharacterIds = snapshot.favorite_character_ids || [];
    state.tags = snapshot.tags || [];
    state.stats = snapshot.stats;
    state.loading = false;
    state.loaded = true;
    state.error = null;
    recalcDerived();
    // Persist
    try {
      if (snapshot.user_id) {
        sessionStorage.setItem(persistKey(snapshot.user_id, snapshot.version), JSON.stringify(snapshot));
        // Clean up other snapshot versions to prevent stale hydration
        for (const ver of SUPPORTED_SNAPSHOT_VERSIONS) {
          if (ver !== snapshot.version) {
            try { sessionStorage.removeItem(persistKey(snapshot.user_id, ver)); } catch {}
          }
        }
      }
    } catch (e) { /* ignore storage errors */ }
    notify();
    try { console.log('[Bootstrap] hydrate applied', { credits: state.credits, subscription: state.subscription?.plan?.name, status: state.subscription?.status }); } catch {}
  },
  setProfile(patch) {
    if (!state.profile) return;
    state.profile = { ...state.profile, ...patch };
    state.profileVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  setCredits(balance, monthlyUsed) {
    state.credits = { balance, ...(monthlyUsed !== undefined ? { monthly_used: monthlyUsed } : {}) } as any;
    state.creditsVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  incrementCredits(delta) {
    if (!state.credits) state.credits = { balance: 0 } as any;
    state.credits.balance += delta;
    state.creditsVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  decrementCredits(delta) {
    if (!state.credits) state.credits = { balance: 0 } as any;
    state.credits.balance = Math.max(0, state.credits.balance - delta);
    state.creditsVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  setSubscription(sub) {
    // Normalize status to allowed union if string mismatch
    if (sub && typeof (sub as any).status === 'string') {
      const raw = (sub as any).status;
      const allowed = ['active','past_due','canceled','trialing'];
      if (!allowed.includes(raw)) (sub as any).status = 'active';
    }
    state.subscription = sub as any;
    state.subscriptionVersion = (state.subscriptionVersion || 0) + 1;
    persistSnapshotCurrent();
    notify();
  },
  updatePersona(id, patch) {
    state.personas = state.personas.map(p => p.id === id ? { ...p, ...patch } : p);
    state.personasVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  addPersona(p) {
    state.personas = [p, ...state.personas];
    state.stats.total_personas += 1;
    state.personasVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  removePersona(id) {
    const before = state.personas.length;
    state.personas = state.personas.filter(p => p.id !== id);
    if (state.personas.length < before) state.stats.total_personas -= 1;
    state.personasVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  updateCharacter(id, patch) {
    state.characters = state.characters.map(c => c.id === id ? { ...c, ...patch } : c);
    state.charactersVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  addCharacter(c) {
    state.characters = [c, ...state.characters];
    state.stats.total_characters += 1;
    state.charactersVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  removeCharacter(id) {
    const before = state.characters.length;
    state.characters = state.characters.filter(c => c.id !== id);
    if (state.characters.length < before) state.stats.total_characters -= 1;
    state.charactersVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  addRecentChat(chat) {
    state.recentChats = [chat, ...state.recentChats.filter(c => c.id !== chat.id)].slice(0, 25);
    state.chatsVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  updateRecentChat(id, patch) {
    state.recentChats = state.recentChats.map(c => c.id === id ? { ...c, ...patch } : c);
    state.chatsVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  setFavorites(ids) {
    state.favoriteCharacterIds = [...ids];
    state.stats.total_favorites = ids.length;
    state.favoritesVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  toggleFavorite(id, favorited) {
    const set = new Set(state.favoriteCharacterIds);
    if (favorited) set.add(id); else set.delete(id);
    state.favoriteCharacterIds = Array.from(set);
    state.stats.total_favorites = state.favoriteCharacterIds.length;
    state.favoritesVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  setTags(tags) {
    state.tags = [...tags];
    persistSnapshotCurrent();
    notify();
  },
  setSettings(patch) {
    if (!state.settings) { state.settings = patch as any; } else { state.settings = { ...state.settings, ...patch }; }
    state.settingsVersion++ as any;
    persistSnapshotCurrent();
    notify();
  },
  setStats(patch) {
    state.stats = { ...state.stats, ...patch };
    persistSnapshotCurrent();
    notify();
  },
  reset() {
    state.snapshotVersion = null;
    state.generatedAt = null;
    state.userId = null;
    state.loading = false;
    state.loaded = false;
    state.error = null;
    state.profile = null;
    state.subscription = null;
    state.credits = null;
    state.settings = null;
    state.personas = [];
    state.characters = [];
    state.recentChats = [];
    state.favoriteCharacterIds = [];
    state.tags = [];
    state.stats = { total_chats: 0, total_characters: 0, total_personas: 0, total_favorites: 0 };
    state.defaultPersona = null;
    hydratePromise = null;
    persistSnapshotCurrent();
    notify();
  },
};

export const bootstrapStore: BootstrapStore = { ...state, ...actions } as any;

// Subscribe API for React adapter
export const subscribeBootstrap = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

// Extended ensureSnapshotLoaded using internal fetcher if not provided
export const ensureSnapshotLoaded = async (fetchFn?: () => Promise<UserSnapshotV2>, force = false) => {
  if (state.loaded && !force) return;
  if (hydratePromise) return hydratePromise;
  state.loading = true;
  state.error = null;
  console.log('[Bootstrap] ensureSnapshotLoaded start', { force, alreadyLoaded: state.loaded });
  notify();
  hydratePromise = (async () => {
    try {
      const snapshot = await (fetchFn ? fetchFn() : fetchUserSnapshotV2());
      console.log('[Bootstrap] snapshot raw', snapshot);
      actions.hydrate(snapshot as any);
      // Fallback: missing credits
      if (!snapshot.credits && snapshot.user_id) {
        try {
          const { data: creditRow, error: creditErr } = await supabase.from('credits').select('balance').eq('user_id', snapshot.user_id).maybeSingle();
          if (!creditErr && creditRow && typeof creditRow.balance === 'number') {
            console.log('[Bootstrap] applied credits fallback select');
            actions.setCredits(creditRow.balance);
          } else if (creditErr) {
            console.warn('[Bootstrap] credits fallback error', creditErr);
          }
        } catch (e) { console.warn('[Bootstrap] credits fallback exception', e); }
      }
      // Fallback: missing subscription
      if (!snapshot.subscription && snapshot.user_id) {
        try {
          const { data: subRow, error: subErr } = await supabase.from('subscriptions').select('id,user_id,plan_id,status,current_period_end,created_at, plan:plans(*)').eq('user_id', snapshot.user_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          if (!subErr && subRow) { console.log('[Bootstrap] applied subscription fallback select'); actions.setSubscription(subRow as any); }
          else if (subErr) console.warn('[Bootstrap] subscription fallback error', subErr);
        } catch (e) { console.warn('[Bootstrap] subscription fallback exception', e); }
      }
      // Schedule retry if still missing
      if (!state.subscription || !state.credits) {
        setTimeout(async () => {
          if (!state.subscription || !state.credits) {
            try {
              console.log('[Bootstrap] retrying snapshot fetch due to missing sections');
              const retry = await fetchUserSnapshotV2();
              actions.hydrate(retry as any);
            } catch {/* swallow */}
          }
        }, 3000);
      }
    } catch (e: any) {
      state.error = e?.message || 'Failed to load snapshot';
      state.loading = false;
      state.loaded = false;
      console.error('[Bootstrap] snapshot load error', e);
      hydratePromise = null;
      notify();
      throw e;
    } finally {
      hydratePromise = null;
    }
  })();
  return hydratePromise;
};

// React integration ----------------------------------------------------------

const BootstrapStoreContext = React.createContext<typeof bootstrapStore | null>(null);

export const BootstrapProvider: React.FC<{ userId: string | null; children: React.ReactNode }> = ({ userId, children }) => {
  // Try cache hydrate once userId available
  useEffect(() => {
    if (!userId) {
      bootstrapStore.reset();
      return;
    }
    const cached = tryHydrateFromCache(userId);
    if (!cached) {
      ensureSnapshotLoaded();
    }
  }, [userId]);

  const [bootLoaded, setBootLoaded] = React.useState(bootstrapStore.loaded);
  React.useEffect(() => {
    const unsub = subscribeBootstrap(() => setBootLoaded(bootstrapStore.loaded));
    return () => { try { unsub(); } catch {} };
  }, []);
  React.useEffect(() => {
    if (userId && bootLoaded) startBootstrapRealtime(userId);
    if (!userId) stopBootstrapRealtime();
  }, [userId, bootLoaded]);

  return React.createElement(BootstrapStoreContext.Provider, { value: bootstrapStore }, children);
};

// Generic subscription hook
function shallowEqual(objA: any, objB: any) {
  if (Object.is(objA, objB)) return true;
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) return false;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  for (let k of keysA) { if (!Object.prototype.hasOwnProperty.call(objB, k) || !Object.is((objA as any)[k], (objB as any)[k])) return false; }
  return true;
}
function useBootstrapSelector<T>(selector: (s: BootstrapStore) => T): T {
  const storeCtx = React.useContext(BootstrapStoreContext);
  if (!storeCtx) throw new Error('BootstrapProvider missing');
  const lastRef = React.useRef<T | null>(null);
  const getSnapshot = () => {
    // Build a fresh composite each time so selectors see up-to-date fields
    const liveComposite: any = { ...state, ...actions };
    const next = selector(liveComposite as BootstrapStore);
    if (lastRef.current && typeof next === 'object' && next !== null && typeof lastRef.current === 'object') {
      if (shallowEqual(lastRef.current as any, next as any)) {
        return lastRef.current as T; // preserve identity
      }
    }
    lastRef.current = next;
    return next;
  };
  return useSyncExternalStore(subscribeBootstrap, getSnapshot, getSnapshot);
}

// Public hooks ---------------------------------------------------------------
export function useBootstrap() {
  return useBootstrapSelector(s => s);
}
export function useSnapshotLoading() {
  return useBootstrapSelector(s => ({ loading: s.loading, loaded: s.loaded, error: s.error }));
}
export function useUserProfile() {
  return useBootstrapSelector(s => ({ profile: s.profile, defaultPersona: s.defaultPersona, loading: s.loading }));
}
export function useCredits() {
  return useBootstrapSelector(s => ({ balance: s.credits?.balance || 0 }));
}
export function useSubscriptionInfo() {
  return useBootstrapSelector(s => ({ subscription: s.subscription }));
}
export function usePersonas() {
  return useBootstrapSelector(s => ({ personas: s.personas, defaultPersonaId: s.profile?.default_persona_id }));
}
export function useCharacters() {
  return useBootstrapSelector(s => ({ characters: s.characters }));
}
export function useRecentChats() {
  return useBootstrapSelector(s => ({ recentChats: s.recentChats }));
}
export function useFavorites() {
  return useBootstrapSelector(s => ({ favoriteCharacterIds: s.favoriteCharacterIds }));
}
export function useChatSettings() {
  return useBootstrapSelector(s => ({ settings: s.settings }));
}
export function useTags() {
  return useBootstrapSelector(s => s.tags);
}
export function useStats() {
  return useBootstrapSelector(s => s.stats);
}

// Imperative helpers ---------------------------------------------------------
export const bootstrapActions = actions;

export function useEnsureSnapshot(force = false) {
  const { loading, loaded } = useSnapshotLoading();
  const run = useCallback(async () => {
    if (loaded && !force) return;
    await ensureSnapshotLoaded();
  }, [loaded, force]);
  return { ensure: run, loading, loaded };
}

// Export existing getBootstrapState unchanged
export const getBootstrapState = () => state;
export { CURRENT_SNAPSHOT_VERSION };

let realtimeChannel: any = null;
export const startBootstrapRealtime = (userId: string) => {
  if (!userId) return;
  if (realtimeChannel) return; // already connected
  realtimeChannel = supabase.channel(`bootstrap-realtime-${userId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'credits', filter: `user_id=eq.${userId}` }, (payload: any) => {
      const newBal = payload.new?.balance;
      if (typeof newBal === 'number') actions.setCredits(newBal);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${userId}` }, (payload: any) => {
      supabase.from('subscriptions').select('id,user_id,plan_id,status,current_period_end,created_at, plan:plans(*)').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle().then(({ data }) => {
        if (data) actions.setSubscription(data as any);
      });
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'character_favorites', filter: `user_id=eq.${userId}` }, async () => {
      const { data } = await supabase.from('character_favorites').select('character_id').eq('user_id', userId).order('created_at', { ascending: false });
      actions.setFavorites((data || []).map(r => r.character_id));
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'characters', filter: `creator_id=eq.${userId}` }, async () => {
      const { data } = await supabase.from('characters').select('id,name,short_description,avatar_url,visibility,interaction_count,chats_count,likes_count,updated_at').eq('creator_id', userId).order('updated_at', { ascending: false }).limit(100);
      if (data) { state.characters = data as any; state.charactersVersion++ as any; persistSnapshotCurrent(); notify(); }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'personas', filter: `user_id=eq.${userId}` }, async () => {
      const { data } = await supabase.from('personas').select('id,name,avatar_url,updated_at').eq('user_id', userId).order('updated_at', { ascending: false }).limit(100);
      if (data) { state.personas = data as any; state.personasVersion++ as any; recalcDerived(); persistSnapshotCurrent(); notify(); }
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chats', filter: `user_id=eq.${userId}` }, (payload: any) => {
      const r = payload.new;
      if (r) {
        actions.addRecentChat({ id: r.id, title: r.title, last_message_at: r.last_message_at, character_id: r.character_id, character_name: r.character_name || '', character_avatar_url: r.character_avatar_url || '', last_message: r.last_message || null, last_message_is_ai: r.last_message_is_ai || false, message_count: r.message_count || 0 } as any);
        state.stats.total_chats = state.stats.total_chats + 1; persistSnapshotCurrent(); notify();
      }
    })
    .subscribe();
};
export const stopBootstrapRealtime = () => { if (realtimeChannel) { supabase.removeChannel(realtimeChannel); realtimeChannel = null; } };
